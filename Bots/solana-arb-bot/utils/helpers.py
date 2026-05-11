from __future__ import annotations

import asyncio
import json
import random
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

import base58
from loguru import logger
from solders.keypair import Keypair


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def exponential_backoff_sleep(attempt: int, base: float = 0.35, cap: float = 8.0) -> None:
    """Jittered backoff for retries (attempt 0 = first retry)."""
    t = min(cap, base * (2**attempt))
    t = t * (0.5 + random.random())
    await asyncio.sleep(t)


class RateLimiter:
    """Simple sliding-window rate limiter for external HTTP APIs."""

    def __init__(self, max_calls: int, per_seconds: float) -> None:
        self.max_calls = max_calls
        self.per_seconds = per_seconds
        self._ts: deque[float] = deque()

    async def acquire(self) -> None:
        now = time.monotonic()
        while self._ts and now - self._ts[0] > self.per_seconds:
            self._ts.popleft()
        if len(self._ts) >= self.max_calls:
            wait = self.per_seconds - (now - self._ts[0]) + 0.01
            await asyncio.sleep(max(wait, 0.05))
            return await self.acquire()
        self._ts.append(time.monotonic())


def load_keypair(private_key_material: str) -> Keypair:
    """
    Load Keypair from env: JSON byte array (Solana CLI format) or base58 seed/secret.
    NEVER log the return value or raw material.
    """
    raw = private_key_material.strip()
    if not raw:
        raise ValueError("PRIVATE_KEY is empty")
    if raw.startswith("["):
        arr: list[int] = json.loads(raw)
        if len(arr) == 64:
            return Keypair.from_bytes(bytes(arr))
        if len(arr) == 32:
            return Keypair.from_seed(bytes(arr))
        raise ValueError("JSON key must be 32 or 64 bytes")
    decoded = base58.b58decode(raw)
    if len(decoded) == 64:
        return Keypair.from_bytes(decoded)
    if len(decoded) == 32:
        return Keypair.from_seed(decoded)
    raise ValueError("Unsupported base58 key length")


def redact(obj: Any) -> Any:
    """Recursively redact obvious secret fields for debug logging."""
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            lk = str(k).lower()
            if lk in ("swaptransaction", "privkey", "privatekey", "authorization"):
                out[k] = "<redacted>"
            else:
                out[k] = redact(v)
        return out
    if isinstance(obj, list):
        return [redact(x) for x in obj]
    return obj


def safe_log_jupiter_body(body: dict[str, Any]) -> None:
    logger.debug("Jupiter swap body keys: {}", list(body.keys()))
