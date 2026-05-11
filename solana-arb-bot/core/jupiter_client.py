from __future__ import annotations

import asyncio
import json
import random
import time
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from typing import Any, Callable, Coroutine, Optional
from urllib.parse import urlencode

import aiohttp
from loguru import logger

from config.settings import Settings
from utils.helpers import safe_log_jupiter_body


def _retry_after_from_headers(headers: dict[str, str], attempt: int) -> float:
    raw = headers.get("Retry-After") or headers.get("retry-after")
    if raw:
        try:
            return max(0.5, float(raw))
        except ValueError:
            try:
                dt = parsedate_to_datetime(raw)
                if dt.tzinfo is None:
                    from datetime import timezone

                    dt = dt.replace(tzinfo=timezone.utc)
                delta = dt.timestamp() - time.time()
                return max(0.5, min(120.0, delta))
            except (TypeError, ValueError, OverflowError):
                pass
    return min(45.0, (1.8**attempt) * (0.5 + random.random() * 0.5))


@dataclass
class QuotePair:
    forward: dict[str, Any]
    reverse: dict[str, Any]
    token_mint: str
    amount_in_raw: int


class JupiterClient:
    """
    Jupiter Swap API (quote + swap).

    Global lock + minimum spacing between calls to stay under lite-api limits;
    retries 429/503 using Retry-When when present.
    """

    def __init__(self, settings: Settings, session: aiohttp.ClientSession) -> None:
        self._s = settings
        self._session = session
        self._http_lock = asyncio.Lock()
        self._last_http_end = 0.0
        self._min_interval = 1.0 / settings.jupiter_max_rps

    def _headers(self) -> dict[str, str]:
        h = {"Accept": "application/json", "Content-Type": "application/json"}
        if self._s.jupiter_api_key:
            h["Authorization"] = f"Bearer {self._s.jupiter_api_key}"
        return h

    async def _pace_before_request(self) -> None:
        while True:
            now = time.monotonic()
            wait = self._min_interval - (now - self._last_http_end)
            if wait <= 0:
                return
            await asyncio.sleep(wait)

    async def _run_jupiter_http(
        self,
        do_request: Callable[[], Coroutine[Any, Any, tuple[int, dict[str, str], str | dict[str, Any]]]],
    ) -> Optional[dict[str, Any]]:
        max_attempts = max(1, self._s.jupiter_rate_limit_retries)
        async with self._http_lock:
            await self._pace_before_request()
            for attempt in range(max_attempts):
                status, headers, payload = await do_request()
                self._last_http_end = time.monotonic()
                if status == 200 and isinstance(payload, dict):
                    return payload
                if status in (429, 503):
                    sleep_s = _retry_after_from_headers(headers, attempt)
                    # First 429 in a chain at WARNING; rest DEBUG to keep bot.log readable.
                    logfn = logger.warning if attempt == 0 else logger.debug
                    logfn(
                        "Jupiter HTTP {} — sleeping {:.1f}s (attempt {}/{})",
                        status,
                        sleep_s,
                        attempt + 1,
                        max_attempts,
                    )
                    await asyncio.sleep(sleep_s)
                    await self._pace_before_request()
                    continue
                err_txt = payload if isinstance(payload, str) else ""
                logger.warning("Jupiter HTTP {}: {}", status, err_txt[:500])
                return None
            logger.warning("Jupiter: exhausted retries after HTTP 429/503")
            return None

    async def quote(
        self,
        input_mint: str,
        output_mint: str,
        amount_raw: int,
        swap_mode: str = "ExactIn",
        only_direct_routes: bool = False,
    ) -> Optional[dict[str, Any]]:
        params: dict[str, Any] = {
            "inputMint": input_mint,
            "outputMint": output_mint,
            "amount": str(int(amount_raw)),
            "slippageBps": self._s.max_slippage_bps,
            "swapMode": swap_mode,
            "onlyDirectRoutes": "true" if only_direct_routes else "false",
        }
        url = f"{self._s.jupiter_quote_url}?{urlencode(params)}"

        async def _do() -> tuple[int, dict[str, str], str | dict[str, Any]]:
            try:
                async with self._session.get(
                    url, headers=self._headers(), timeout=aiohttp.ClientTimeout(total=30)
                ) as r:
                    txt = await r.text()
                    hdr = {k: v for k, v in r.headers.items()}
                    if r.status == 200:
                        try:
                            return 200, hdr, json.loads(txt)
                        except json.JSONDecodeError:
                            return 500, hdr, txt
                    return r.status, hdr, txt
            except Exception as e:  # noqa: BLE001
                logger.warning("Jupiter quote transport: {}", e)
                return 599, {}, str(e)

        return await self._run_jupiter_http(_do)

    async def swap_transaction(
        self,
        quote_response: dict[str, Any],
        user_public_key: str,
    ) -> Optional[dict[str, Any]]:
        body: dict[str, Any] = {
            "userPublicKey": user_public_key,
            "quoteResponse": quote_response,
            "wrapAndUnwrapSol": True,
            "dynamicComputeUnitLimit": True,
            "prioritizationFeeLamports": {
                "priorityLevelWithMaxLamports": {
                    "priorityLevel": self._s.jupiter_priority_level,
                    "maxLamports": self._s.jupiter_priority_max_lamports,
                }
            },
        }
        safe_log_jupiter_body(body)

        async def _do() -> tuple[int, dict[str, str], str | dict[str, Any]]:
            try:
                async with self._session.post(
                    self._s.jupiter_swap_url,
                    json=body,
                    headers=self._headers(),
                    timeout=aiohttp.ClientTimeout(total=40),
                ) as r:
                    txt = await r.text()
                    hdr = {k: v for k, v in r.headers.items()}
                    if r.status == 200:
                        try:
                            return 200, hdr, json.loads(txt)
                        except json.JSONDecodeError:
                            return 500, hdr, txt
                    return r.status, hdr, txt
            except Exception as e:  # noqa: BLE001
                logger.warning("Jupiter swap transport: {}", e)
                return 599, {}, str(e)

        return await self._run_jupiter_http(_do)

    async def round_trip_quotes(
        self,
        input_mint: str,
        token_mint: str,
        amount_in_raw: int,
    ) -> Optional[QuotePair]:
        """
        USDC(INPUT)->TOKEN then TOKEN->USDC using forward outAmount as reverse input (ExactIn both legs).
        """
        fwd = await self.quote(input_mint, token_mint, amount_in_raw)
        if not fwd or not fwd.get("outAmount"):
            return None
        mid = int(fwd["outAmount"])
        rev = await self.quote(token_mint, input_mint, mid)
        if not rev or not rev.get("outAmount"):
            return None
        return QuotePair(forward=fwd, reverse=rev, token_mint=token_mint, amount_in_raw=amount_in_raw)

    def debug_quote_pair(self, qp: QuotePair) -> dict[str, Any]:
        return {
            "token": qp.token_mint,
            "in_raw": qp.amount_in_raw,
            "fwd_out": qp.forward.get("outAmount"),
            "rev_out": qp.reverse.get("outAmount"),
            "fwd_impact": qp.forward.get("priceImpactPct"),
            "rev_impact": qp.reverse.get("priceImpactPct"),
        }


def estimate_net_profit_pct(
    settings: Settings,
    quote_pair: QuotePair,
    sol_price_usd: float,
) -> float:
    """
    Approximate net edge vs input (not financial advice).
    Subtracts extra_fee_buffer_bps and rough priority fee expressed as % of notional.
    """
    ain = int(quote_pair.forward.get("inAmount", quote_pair.amount_in_raw))
    aout = int(quote_pair.reverse.get("outAmount", 0))
    if ain <= 0:
        return -1.0
    gross = aout / ain - 1.0
    fee_buf = settings.extra_fee_buffer_bps / 10_000.0
    # USDC notional
    notional_usd = ain / float(10**settings.input_decimals)
    prio_pct = (settings.estimated_priority_fee_usd / notional_usd) if notional_usd > 0 else 0.0
    impact = 0.0
    try:
        impact += abs(float(quote_pair.forward.get("priceImpactPct") or 0)) / 100.0
        impact += abs(float(quote_pair.reverse.get("priceImpactPct") or 0)) / 100.0
    except (TypeError, ValueError):
        pass
    _ = sol_price_usd  # reserved for SOL-denominated fee refinement
    return gross - fee_buf - prio_pct - impact
