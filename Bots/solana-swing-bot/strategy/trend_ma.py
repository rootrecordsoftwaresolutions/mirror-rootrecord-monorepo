from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Literal

Signal = Literal["BUY", "SELL", "HOLD"]


@dataclass
class StrategyUpdate:
    """One bar of strategy output: fired signal (if any) and what we are set up to do next."""

    signal: Signal
    planned_move: str
    bars: int
    fast_sma: float | None
    slow_sma: float | None


class MASwingStrategy:
    """
    Simple dual-SMA crossover on a price series (e.g. implied USDC per SOL from Jupiter).

    BUY: fast SMA crosses above slow. SELL: fast crosses below slow.
    """

    def __init__(self, fast: int, slow: int) -> None:
        self.fast = fast
        self.slow = slow
        self._closes: deque[float] = deque(maxlen=max(slow * 4, 200))
        self._prev_diff: float | None = None

    def _sma(self, n: int) -> float | None:
        if len(self._closes) < n:
            return None
        chunk = list(self._closes)[-n:]
        return sum(chunk) / float(n)

    def _planned_move(self, in_position: bool, f: float | None, s: float | None, diff: float | None) -> str:
        if f is None or s is None or diff is None:
            n = len(self._closes)
            return f"Warming up — {n}/{self.slow} closes for slow MA; no trades until MAs are live."

        spread_pct = (100.0 * diff / s) if s != 0 else 0.0
        if in_position:
            if diff >= 0:
                return (
                    f"In position: fast MA ${f:.4f} ≥ slow ${s:.4f} "
                    f"(spread {spread_pct:+.3f}%). Planned: SELL when fast crosses *below* slow (death cross)."
                )
            return (
                f"In position; fast ${f:.4f} < slow ${s:.4f} — trend rolled over. "
                f"Planned: SELL on this bar if swap path succeeds (death-cross signal)."
            )
        if diff <= 0:
            return (
                f"Flat: fast MA ${f:.4f} ≤ slow ${s:.4f} (spread {spread_pct:+.3f}%). "
                f"Planned: BUY when fast crosses *above* slow (golden cross)."
            )
        return (
            f"Flat: fast MA ${f:.4f} already above slow ${s:.4f} (spread {spread_pct:+.3f}%). "
            f"Planned: BUY only after price weakens (fast below slow) then crosses up again; "
            f"otherwise wait (no chase entry on this template)."
        )

    def update(self, price: float, in_position: bool) -> StrategyUpdate:
        self._closes.append(price)
        f = self._sma(self.fast)
        s = self._sma(self.slow)
        diff: float | None = None
        sig: Signal = "HOLD"
        if f is not None and s is not None:
            diff = f - s
            if self._prev_diff is not None:
                if self._prev_diff <= 0.0 and diff > 0.0:
                    sig = "BUY"
                elif self._prev_diff >= 0.0 and diff < 0.0:
                    sig = "SELL"
            self._prev_diff = diff
        else:
            self._prev_diff = None

        plan = self._planned_move(in_position, f, s, diff)
        return StrategyUpdate(
            signal=sig,
            planned_move=plan,
            bars=len(self._closes),
            fast_sma=f,
            slow_sma=s,
        )
