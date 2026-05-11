from __future__ import annotations

import time
from typing import Any
from urllib.parse import quote

import aiohttp
from loguru import logger

from config.settings import Settings
from discovery.pair_filter import RawPair
from utils.helpers import RateLimiter


class TokenDiscovery:
    """Dexscreener (no key) + optional Birdeye trending."""

    def __init__(self, settings: Settings, session: aiohttp.ClientSession) -> None:
        self._s = settings
        self._session = session
        self._lim_ds = RateLimiter(max_calls=20, per_seconds=60.0)
        self._lim_be = RateLimiter(max_calls=30, per_seconds=60.0)

    def _pair_age_min(self, pair_created_at: Any) -> float:
        if pair_created_at is None:
            return 10_000.0
        try:
            ts = float(pair_created_at)
        except (TypeError, ValueError):
            return 10_000.0
        now_ms = time.time() * 1000.0
        return max(0.0, (now_ms - ts) / 60_000.0)

    def _raw_from_dex_pair(self, d: dict[str, Any]) -> RawPair | None:
        try:
            base = d.get("baseToken") or {}
            quote = d.get("quoteToken") or {}
            liq = d.get("liquidity") or {}
            vol = d.get("volume") or {}
            bm = str(base.get("address", "")).strip()
            qm = str(quote.get("address", "")).strip()
            if not bm or not qm:
                return None
            return RawPair(
                base_mint=bm,
                quote_mint=qm,
                liquidity_usd=float(liq.get("usd") or 0),
                volume_5m_usd=float(vol.get("m5") or 0),
                volume_1h_usd=float(vol.get("h1") or 0),
                pair_age_min=self._pair_age_min(d.get("pairCreatedAt")),
                volume_h24_usd=float(vol.get("h24") or 0),
                dex_id=str(d.get("dexId", "")),
                pair_address=str(d.get("pairAddress", "")),
            )
        except Exception:  # noqa: BLE001
            return None

    async def fetch_dexscreener_pairs(self) -> list[RawPair]:
        await self._lim_ds.acquire()
        out: list[RawPair] = []
        queries = ["SOL USDC", "USDC SOL", "JUP USDC", "BONK SOL", "RAY USDC", "WIF USDC"]
        base = self._s.dexscreener_api_base.rstrip("/")
        for q in queries:
            url = f"{base}/latest/dex/search?q={quote(q)}"
            try:
                async with self._session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as r:
                    if r.status != 200:
                        continue
                    js = await r.json()
                    for d in js.get("pairs") or []:
                        if str(d.get("chainId", "")).lower() != "solana":
                            continue
                        rp = self._raw_from_dex_pair(d)
                        if rp:
                            out.append(rp)
            except Exception as e:  # noqa: BLE001
                logger.warning("Dexscreener search {!r}: {}", q, e)
        return out

    async def fetch_birdeye_trending(self) -> list[RawPair]:
        if not self._s.birdeye_api_key:
            return []
        await self._lim_be.acquire()
        headers = {
            "X-API-KEY": self._s.birdeye_api_key,
            "x-chain": "solana",
            "accept": "application/json",
        }
        url = f"{self._s.birdeye_api_base.rstrip('/')}/defi/tokenlist"
        params = {"sort_by": "v24hUSD", "sort_type": "desc", "offset": 0, "limit": 80}
        out: list[RawPair] = []
        try:
            async with self._session.get(
                url, headers=headers, params=params, timeout=aiohttp.ClientTimeout(total=25)
            ) as r:
                if r.status != 200:
                    logger.warning("Birdeye tokenlist HTTP {}", r.status)
                    return []
                js = await r.json()
                data = js.get("data")
                rows: list[Any] = []
                if isinstance(data, list):
                    rows = data
                elif isinstance(data, dict):
                    rows = data.get("tokens") or data.get("items") or []
                for row in rows:
                    mint = str(row.get("address") or row.get("mint") or "").strip()
                    if not mint:
                        continue
                    # Synthesize pseudo-pair vs USDC for filtering (volume/liq from token row)
                    liq = float(row.get("liquidity", 0) or row.get("mc", 0) or 0)
                    v24 = float(row.get("v24hUSD", 0) or 0)
                    out.append(
                        RawPair(
                            base_mint=mint,
                            quote_mint=self._s.input_mint,
                            liquidity_usd=max(liq, 1.0),
                            volume_5m_usd=v24 / 288.0,
                            volume_1h_usd=v24 / 24.0,
                            pair_age_min=self._s.min_pair_age_min + 1.0,
                            volume_h24_usd=v24,
                            dex_id="birdeye",
                        )
                    )
        except Exception as e:  # noqa: BLE001
            logger.warning("Birdeye tokenlist: {}", e)
        return out
