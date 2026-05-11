from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from loguru import logger

from config.settings import Settings


@dataclass
class RiskState:
    day: str = ""
    realized_pnl_usd: float = 0.0
    peak_usdc_balance: float = 0.0
    last_usdc_balance: float = 0.0
    emergency_stop: bool = False
    emergency_reason: str = ""
    rpc_errors_recent: int = 0


class RiskManager:
    """
    Position sizing, daily loss cap, drawdown stop, token cooldowns, concurrency.
    HIGH RISK: heuristics are not guarantees; markets and RPC can move between quote and fill.
    """

    def __init__(self, settings: Settings) -> None:
        self._s = settings
        self._state_path = settings.state_path
        self._cooldowns: dict[str, float] = {}
        self.state = RiskState()
        self._load()

    def _load(self) -> None:
        p = self._state_path
        if not p.is_file():
            return
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            self.state = RiskState(
                day=raw.get("day", ""),
                realized_pnl_usd=float(raw.get("realized_pnl_usd", 0)),
                peak_usdc_balance=float(raw.get("peak_usdc_balance", 0)),
                last_usdc_balance=float(raw.get("last_usdc_balance", 0)),
                emergency_stop=bool(raw.get("emergency_stop", False)),
                emergency_reason=str(raw.get("emergency_reason", "")),
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("Could not load risk state {}: {}", p, e)

    def save(self) -> None:
        self._state_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "day": self.state.day,
            "realized_pnl_usd": self.state.realized_pnl_usd,
            "peak_usdc_balance": self.state.peak_usdc_balance,
            "last_usdc_balance": self.state.last_usdc_balance,
            "emergency_stop": self.state.emergency_stop,
            "emergency_reason": self.state.emergency_reason,
            "updated": datetime.now(timezone.utc).isoformat(),
        }
        self._state_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def rollover_day_if_needed(self) -> None:
        today = date.today().isoformat()
        if self.state.day != today:
            self.state.day = today
            self.state.realized_pnl_usd = 0.0
            self.save()

    def on_balance_snapshot(self, usdc_balance: float) -> None:
        self.rollover_day_if_needed()
        self.state.last_usdc_balance = usdc_balance
        if usdc_balance > self.state.peak_usdc_balance:
            self.state.peak_usdc_balance = usdc_balance
        self.save()

    def position_usdc_amount(self, usdc_balance: float) -> float:
        return max(0.0, usdc_balance * self._s.position_size_pct)

    def record_trade_pnl(self, delta_usd: float) -> None:
        self.rollover_day_if_needed()
        self.state.realized_pnl_usd += delta_usd
        self.save()

    def drawdown_ok(self, usdc_balance: float) -> bool:
        peak = self.state.peak_usdc_balance or usdc_balance
        if peak <= 0:
            return True
        dd = (peak - usdc_balance) / peak
        if dd >= self._s.drawdown_stop_pct:
            self.trigger_emergency_stop(f"Drawdown {dd:.2%} >= cap {self._s.drawdown_stop_pct:.2%}")
            return False
        return True

    def daily_loss_ok(self) -> bool:
        if self.state.realized_pnl_usd <= -abs(self._s.daily_max_loss_usd):
            self.trigger_emergency_stop("Daily loss limit reached")
            return False
        return True

    def trigger_emergency_stop(self, reason: str) -> None:
        if not self.state.emergency_stop:
            logger.error("EMERGENCY STOP: {}", reason)
        self.state.emergency_stop = True
        self.state.emergency_reason = reason
        self.save()

    def clear_emergency_stop(self) -> None:
        self.state.emergency_stop = False
        self.state.emergency_reason = ""
        self.save()

    def is_trading_allowed(self, usdc_balance: float) -> bool:
        if self.state.emergency_stop:
            return False
        if not self.daily_loss_ok():
            return False
        if not self.drawdown_ok(usdc_balance):
            return False
        return True

    def note_rpc_error(self) -> None:
        self.state.rpc_errors_recent += 1
        if self.state.rpc_errors_recent >= self._s.rpc_error_burst_limit:
            self.trigger_emergency_stop("RPC error burst")

    def note_rpc_success(self) -> None:
        self.state.rpc_errors_recent = 0

    def cooldown_active(self, token_mint: str, now: float) -> bool:
        until = self._cooldowns.get(token_mint)
        return until is not None and now < until

    def set_cooldown(self, token_mint: str, now: float) -> None:
        self._cooldowns[token_mint] = now + self._s.token_cooldown_sec

    def trading_guards_summary(self) -> dict[str, Any]:
        return {
            "emergency_stop": self.state.emergency_stop,
            "emergency_reason": self.state.emergency_reason,
            "realized_pnl_usd_today": self.state.realized_pnl_usd,
            "peak_usdc": self.state.peak_usdc_balance,
            "last_usdc": self.state.last_usdc_balance,
        }
