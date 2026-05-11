from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import aiohttp
from loguru import logger
from solders.keypair import Keypair
from solders.pubkey import Pubkey

from config.settings import Settings
from core.jupiter_client import JupiterClient, QuotePair, estimate_net_profit_pct
from core.rpc_client import SolanaRpcClient, pubkey_or_from_keypair
from discovery.pair_filter import PairFilter, RawPair
from discovery.token_discovery import TokenDiscovery
from execution.jito_bundle import JitoBundleClient
from execution.swap_executor import SwapExecutor
from monitoring.notifier import Notifier
from utils.risk import RiskManager


@dataclass
class Opportunity:
    token_mint: str
    net_profit_pct: float
    gross_profit_pct: float
    quote_pair: QuotePair


class ArbitrageEngine:
    """
    Coordinates discovery, scanning, execution, and risk gates.

    NOTE: Two-leg Jupiter execution is NOT atomic on-chain; price can move between txs.
    """

    def __init__(
        self,
        settings: Settings,
        rpc: SolanaRpcClient,
        jupiter: JupiterClient,
        discovery: TokenDiscovery,
        pair_filter: PairFilter,
        risk: RiskManager,
        notifier: Notifier,
        swap_executor: SwapExecutor,
        jito: Optional[JitoBundleClient],
        session: aiohttp.ClientSession,
    ) -> None:
        self._s = settings
        self._rpc = rpc
        self._jup = jupiter
        self._disc = discovery
        self._filt = pair_filter
        self._risk = risk
        self._notify = notifier
        self._swap = swap_executor
        self._jito = jito
        self._session = session
        self._keypair: Optional[Keypair] = None
        if settings.private_key:
            from utils.helpers import load_keypair

            self._keypair = load_keypair(settings.private_key)
        self._owner = pubkey_or_from_keypair(settings.wallet_address, self._keypair)
        self._input_mint = Pubkey.from_string(settings.input_mint)
        self._watchlist: list[str] = list(settings.seed_token_mints)
        self._blacklist: set[str] = self._load_blacklist()
        self._sem = asyncio.Semaphore(settings.max_concurrent_trades)
        self._last_discovery_ts = 0.0
        self._sol_price_hint_ts = 0.0
        self._sol_price_usd = 150.0
        self._stats: dict[str, Any] = {
            "scans": 0,
            "opportunities": 0,
            "executions": 0,
            "last_best": None,
        }

    def _passes_profit_gate(self, qp: QuotePair) -> bool:
        ain = int(qp.forward.get("inAmount", qp.amount_in_raw))
        aout = int(qp.reverse.get("outAmount", 0))
        gross = (aout / ain - 1.0) if ain > 0 else -1.0
        net = estimate_net_profit_pct(self._s, qp, self._sol_price_usd)
        if self._s.min_profit_net_pct <= 0:
            return gross > 0.0
        return net >= self._s.min_profit_net_pct

    async def _quotes_for_execution(self, op: Opportunity) -> Optional[QuotePair]:
        """Fresh round-trip quotes at execution time (optional); same profit gate as scan."""
        if not self._s.refresh_quotes_before_execute:
            return op.quote_pair
        fresh = await self._jup.round_trip_quotes(
            self._s.input_mint, op.token_mint, op.quote_pair.amount_in_raw
        )
        if fresh is None:
            logger.info("Pre-exec quote refresh: no route for {}", op.token_mint[:12])
            return None
        if not self._passes_profit_gate(fresh):
            net = estimate_net_profit_pct(self._s, fresh, self._sol_price_usd)
            logger.info(
                "Pre-exec quote refresh: below profit gate for {} (net~{:.3%})",
                op.token_mint[:12],
                net,
            )
            return None
        return fresh

    def snapshot(self) -> dict[str, Any]:
        return {
            "watchlist_head": self._watchlist[:25],
            "watchlist_len": len(self._watchlist),
            "blacklist_len": len(self._blacklist),
            "stats": dict(self._stats),
            "risk": self._risk.trading_guards_summary(),
        }

    def _load_blacklist(self) -> set[str]:
        p: Path = self._s.blacklist_path
        if not p.is_file():
            return set()
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return set(str(x) for x in data)
            if isinstance(data, dict) and "mints" in data:
                return set(str(x) for x in data["mints"])
        except Exception as e:  # noqa: BLE001
            logger.warning("Blacklist load failed: {}", e)
        return set()

    def _save_blacklist(self) -> None:
        self._s.blacklist_path.parent.mkdir(parents=True, exist_ok=True)
        self._s.blacklist_path.write_text(
            json.dumps({"mints": sorted(self._blacklist)}, indent=2),
            encoding="utf-8",
        )

    def blacklist_mint(self, mint: str) -> None:
        self._blacklist.add(mint)
        self._save_blacklist()

    async def refresh_watchlist(self, now: float) -> None:
        if now - self._last_discovery_ts < self._s.discovery_interval_sec and self._watchlist:
            return
        self._last_discovery_ts = now
        raw_pairs: list[RawPair] = []
        raw_pairs.extend(await self._disc.fetch_dexscreener_pairs())
        if self._s.birdeye_api_key:
            raw_pairs.extend(await self._disc.fetch_birdeye_trending())
        filtered = self._filt.filter_pairs(raw_pairs)
        logger.info("Discovery: {} raw pairs → {} after filters", len(raw_pairs), len(filtered))
        mints: list[str] = []
        for p in filtered:
            for m in (p.base_mint, p.quote_mint):
                if m == self._s.input_mint:
                    continue
                if m in self._blacklist:
                    continue
                mints.append(m)
        # de-dupe preserve order
        seen: set[str] = set()
        merged: list[str] = []
        for m in list(self._s.seed_token_mints) + mints:
            if m not in seen:
                seen.add(m)
                merged.append(m)
        self._watchlist = merged[: self._s.watchlist_size]
        logger.info("Watchlist size {} (cap {})", len(self._watchlist), self._s.watchlist_size)

    async def _update_sol_price_hint(self) -> None:
        """Optional ccxt Binance SOL/USDT for coarse fee heuristics. Throttled; always closes exchange."""
        if not self._s.use_ccxt_sol_price:
            return
        now = time.monotonic()
        if now - self._sol_price_hint_ts < self._s.sol_price_refresh_sec:
            return
        self._sol_price_hint_ts = now

        try:
            import ccxt.async_support as ccxt  # type: ignore
        except ImportError:
            return

        ex = None
        try:
            ex = ccxt.binance({"enableRateLimit": True})
            t = await ex.fetch_ticker("SOL/USDT")
            last = float(t.get("last") or self._sol_price_usd)
            if last > 0:
                self._sol_price_usd = last
        except Exception as e:  # noqa: BLE001
            logger.debug("SOL/USD hint skipped: {}", e)
        finally:
            if ex is not None:
                try:
                    await ex.close()
                except Exception as e:  # noqa: BLE001
                    logger.debug("ccxt.close: {}", e)

    async def scan_token(self, token_mint: str) -> Optional[Opportunity]:
        bal_raw = await self._rpc.get_spl_balance_raw(self._owner, self._input_mint)
        usdc = bal_raw / float(10**self._s.input_decimals)
        if not self._risk.is_trading_allowed(usdc):
            return None
        trade_usdc = self._risk.position_usdc_amount(usdc)
        if trade_usdc <= 0:
            return None
        amount_raw = int(trade_usdc * (10**self._s.input_decimals))
        if amount_raw <= 0:
            return None

        qp = await self._jup.round_trip_quotes(self._s.input_mint, token_mint, amount_raw)
        if qp is None or not self._passes_profit_gate(qp):
            return None
        ain = int(qp.forward.get("inAmount", amount_raw))
        aout = int(qp.reverse.get("outAmount", 0))
        gross = (aout / ain - 1.0) if ain > 0 else -1.0
        net = estimate_net_profit_pct(self._s, qp, self._sol_price_usd)
        return Opportunity(
            token_mint=token_mint,
            net_profit_pct=net,
            gross_profit_pct=gross,
            quote_pair=qp,
        )

    async def scan_once(self) -> list[Opportunity]:
        now = time.monotonic()
        await self.refresh_watchlist(now)
        await self._update_sol_price_hint()

        bal_raw = await self._rpc.get_spl_balance_raw(self._owner, self._input_mint)
        usdc = bal_raw / float(10**self._s.input_decimals)
        self._risk.on_balance_snapshot(usdc)

        sem = asyncio.Semaphore(self._s.max_scan_concurrency)

        async def _one(m: str) -> Optional[Opportunity]:
            async with sem:
                if self._risk.cooldown_active(m, time.monotonic()):
                    return None
                try:
                    return await self.scan_token(m)
                except Exception as e:  # noqa: BLE001
                    logger.debug("scan_token {} err {}", m, e)
                    self._risk.note_rpc_error()
                    return None

        tasks = [_one(m) for m in self._watchlist if m not in self._blacklist]
        results = await asyncio.gather(*tasks)
        out = [r for r in results if r is not None]
        out.sort(key=lambda o: o.net_profit_pct, reverse=True)
        self._stats["scans"] += 1
        self._risk.note_rpc_success()
        if out:
            self._stats["opportunities"] += len(out)
            self._stats["last_best"] = {
                "token": out[0].token_mint,
                "net_pct": out[0].net_profit_pct,
                "gross_pct": out[0].gross_profit_pct,
            }
        return out

    async def execute_best(self, op: Opportunity) -> None:
        async with self._sem:
            if self._risk.cooldown_active(op.token_mint, time.monotonic()):
                return
            if not self._keypair and not self._s.dry_run:
                logger.error("Missing PRIVATE_KEY for live execution")
                return
            await self._notify.send(
                f"Opportunity {op.token_mint[:8]}… net~{op.net_profit_pct:.3%} gross~{op.gross_profit_pct:.3%}"
            )
            try:
                qp_exec = await self._quotes_for_execution(op)
                if qp_exec is None:
                    return
                if self._s.use_jito_bundle and self._jito and self._keypair:
                    ok = await self._swap.execute_round_trip_jito(
                        qp_exec,
                        str(self._owner),
                        self._keypair,
                        self._jito,
                    )
                else:
                    ok = await self._swap.execute_round_trip_sequential(
                        qp_exec,
                        str(self._owner),
                        self._keypair,
                    )
                if ok:
                    self._stats["executions"] += 1
                    self._risk.set_cooldown(op.token_mint, time.monotonic())
                    await self._notify.send(f"Executed round-trip on {op.token_mint[:8]}… (dry_run={self._s.dry_run})")
                else:
                    # Auto-blacklist on failed sim/send; clear data/blacklist.json if too aggressive.
                    self.blacklist_mint(op.token_mint)
                    await self._notify.send(f"Execution failed; blacklisted {op.token_mint[:8]}…")
            except Exception as e:  # noqa: BLE001
                logger.exception("execute_best: {}", e)
                self._risk.note_rpc_error()
                await self._notify.send(f"Execution error: {e!s}"[:500])
