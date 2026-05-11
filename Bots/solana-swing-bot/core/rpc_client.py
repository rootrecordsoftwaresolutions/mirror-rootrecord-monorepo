from __future__ import annotations

import asyncio
import base64
from typing import Any

import aiohttp
from loguru import logger
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from solana.rpc.types import TxOpts
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction

from config.settings import Settings


class SolanaRpcClient:
    def __init__(self, settings: Settings, session: aiohttp.ClientSession) -> None:
        self._s = settings
        self._session = session
        self._client = AsyncClient(settings.solana_rpc_url, commitment=Confirmed)

    async def close(self) -> None:
        await self._client.close()

    async def get_sol_balance_lamports(self, owner: Pubkey) -> int:
        r = await self._client.get_balance(owner)
        return int(r.value)

    async def _rpc_post(self, method: str, params: list[Any]) -> dict[str, Any]:
        body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
        async with self._session.post(
            self._s.solana_rpc_url,
            json=body,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as r:
            js = await r.json()
        if "error" in js:
            raise RuntimeError(str(js["error"]))
        return js.get("result") or {}

    async def get_spl_balance_raw(self, owner: Pubkey, mint: Pubkey) -> int:
        """Sum parsed token amounts for all ATAs of `mint` owned by `owner`."""
        for attempt in range(4):
            try:
                res = await self._rpc_post(
                    "getTokenAccountsByOwner",
                    [
                        str(owner),
                        {"mint": str(mint)},
                        {"encoding": "jsonParsed"},
                    ],
                )
                total = 0
                for acc in res.get("value") or []:
                    parsed = acc.get("account", {}).get("data", {}).get("parsed", {})
                    info = parsed.get("info", {})
                    tok = info.get("tokenAmount", {})
                    amt = tok.get("amount")
                    if amt is not None:
                        total += int(amt)
                return total
            except Exception as e:  # noqa: BLE001
                logger.warning("get_spl_balance_raw retry {}: {}", attempt, e)
                await asyncio.sleep(0.35 * (2**attempt))
        raise RuntimeError("get_spl_balance_raw failed after retries")

    async def simulate_v0(self, tx: VersionedTransaction) -> dict[str, Any]:
        enc = base64.b64encode(bytes(tx)).decode("ascii")
        body = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "simulateTransaction",
            "params": [
                enc,
                {
                    "encoding": "base64",
                    "sigVerify": True,
                    "commitment": self._s.commitment,
                },
            ],
        }
        async with self._session.post(
            self._s.solana_rpc_url,
            json=body,
            timeout=aiohttp.ClientTimeout(total=30),
        ) as r:
            js = await r.json()
        if "error" in js:
            raise RuntimeError(str(js["error"]))
        val = (js.get("result") or {}).get("value") or {}
        return {
            "err": val.get("err"),
            "logs": val.get("logs"),
            "units_consumed": val.get("unitsConsumed"),
        }

    async def send_raw_transaction(self, tx: VersionedTransaction, skip_preflight: bool = False) -> str:
        opts = TxOpts(skip_preflight=skip_preflight, preflight_commitment=Confirmed)
        res = await self._client.send_transaction(tx, opts=opts)
        return str(res.value)


def pubkey_from_wallet_or_key(wallet: str, keypair: Keypair | None) -> Pubkey:
    if wallet.strip():
        return Pubkey.from_string(wallet.strip())
    if keypair:
        return keypair.pubkey()
    raise ValueError("WALLET_ADDRESS or PRIVATE_KEY required")
