from __future__ import annotations

import time
from dataclasses import dataclass

from loguru import logger

from config.settings import Settings


@dataclass
class RawPair:
    """Normalized pair metadata from Dexscreener/Birdeye-like sources."""

    base_mint: str
    quote_mint: str
    liquidity_usd: float
    volume_5m_usd: float
    volume_1h_usd: float
    pair_age_min: float
    volume_h24_usd: float = 0.0
    dex_id: str = ""
    pair_address: str = ""


class PairFilter:
    def __init__(self, settings: Settings) -> None:
        self._s = settings

    def filter_pairs(self, pairs: list[RawPair]) -> list[RawPair]:
        now_ms = time.time() * 1000.0
        out: list[RawPair] = []
        for p in pairs:
            if p.liquidity_usd < self._s.min_liquidity_usd:
                continue
            if p.pair_age_min < self._s.min_pair_age_min:
                continue
            # max_pair_age_min <= 0 disables upper bound (established SOL/USDC pools are years old)
            if self._s.max_pair_age_min > 0 and p.pair_age_min > self._s.max_pair_age_min:
                continue
            # Dexscreener often has m5=0; use 1h / 24h implied per-minute so majors still qualify.
            vol = max(
                p.volume_5m_usd,
                p.volume_1h_usd / 12.0,
                p.volume_h24_usd / 24.0,
            )
            if vol < self._s.min_volume_5m_usd:
                continue
            # Prefer routes touching USDC / SOL as one side
            stable = self._s.input_mint
            sol = "So11111111111111111111111111111111111111112"
            if stable not in (p.base_mint, p.quote_mint) and sol not in (p.base_mint, p.quote_mint):
                continue
            out.append(p)
        out.sort(
            key=lambda x: x.volume_5m_usd + x.volume_1h_usd + x.volume_h24_usd / 24.0,
            reverse=True,
        )
        logger.debug("PairFilter kept {} / {}", len(out), len(pairs))
        return out
