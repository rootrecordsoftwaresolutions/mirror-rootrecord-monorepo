from __future__ import annotations

import asyncio
import json
import random
import time
from email.utils import parsedate_to_datetime
from typing import Any, Callable, Coroutine, Optional

from aiohttp import ClientSession, ClientTimeout
from loguru import logger

from config.settings import Settings
from utils.helpers import redact_for_log


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


class JupiterLite:
    """Minimal Jupiter quote + swap for single-leg execution."""

    def __init__(self, settings: Settings, session: ClientSession) -> None:
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

    async def _run_http(
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
    ) -> Optional[dict[str, Any]]:
        from urllib.parse import urlencode

        params: dict[str, Any] = {
            "inputMint": input_mint,
            "outputMint": output_mint,
            "amount": str(int(amount_raw)),
            "slippageBps": self._s.max_slippage_bps,
            "swapMode": swap_mode,
            "onlyDirectRoutes": "false",
        }
        url = f"{self._s.jupiter_quote_url}?{urlencode(params)}"

        async def _do() -> tuple[int, dict[str, str], str | dict[str, Any]]:
            try:
                async with self._session.get(
                    url, headers=self._headers(), timeout=ClientTimeout(total=30)
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

        return await self._run_http(_do)

    async def swap_transaction(self, quote_response: dict[str, Any], user_public_key: str) -> Optional[dict[str, Any]]:
        prio = self._s.jupiter_priority_max_lamports
        logger.info(
            "Jupiter swap tip cap: priority={} max_lamports={} (~{:.6f} SOL tip ceiling; base CU fee separate)",
            self._s.jupiter_priority_level,
            prio,
            prio / 1e9,
        )
        body: dict[str, Any] = {
            "userPublicKey": user_public_key,
            "quoteResponse": quote_response,
            "wrapAndUnwrapSol": True,
            "dynamicComputeUnitLimit": True,
            "prioritizationFeeLamports": {
                "priorityLevelWithMaxLamports": {
                    "priorityLevel": self._s.jupiter_priority_level,
                    "maxLamports": prio,
                }
            },
        }
        logger.debug("Jupiter swap body {}", redact_for_log({k: v for k, v in body.items() if k != "quoteResponse"}))

        async def _do() -> tuple[int, dict[str, str], str | dict[str, Any]]:
            try:
                async with self._session.post(
                    self._s.jupiter_swap_url,
                    json=body,
                    headers=self._headers(),
                    timeout=ClientTimeout(total=40),
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

        return await self._run_http(_do)
