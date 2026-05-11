from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import base58
from solders.keypair import Keypair


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_keypair(private_key_material: str) -> Keypair:
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


def redact_for_log(obj: Any) -> Any:
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            if str(k).lower() in ("swaptransaction", "privkey", "privatekey", "authorization"):
                out[k] = "<redacted>"
            else:
                out[k] = redact_for_log(v)
        return out
    if isinstance(obj, list):
        return [redact_for_log(x) for x in obj]
    return obj
