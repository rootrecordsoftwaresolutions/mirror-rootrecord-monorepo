from __future__ import annotations

import base64
from decimal import Decimal
from typing import Any, Optional

import aiohttp
from loguru import logger
from solana.rpc.async_api import AsyncClient
from solana.rpc.commitment import Confirmed
from solana.rpc.types import TxOpts
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction

from config.settings import Settings
from utils.helpers import exponential_backoff_sleep


LAMPORTS_PER_SOL = 1_000_000_000


class SolanaRpcClient:
    """Async RPC: solana-py client + JSON-RPC balance helper for SPL compatibility."""

    def __init__(self, settings: Settings, session: aiohttp.ClientSession) -> None:
        self._s = settings
        self._session = session
        self._client = AsyncClient(settings.solana_rpc_url, commitment=Confirmed)

    @property
    def inner(self) -> AsyncClient:
        return self._client

    async def close(self) -> None:
        await self._client.close()

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

    async def get_sol_balance_lamports(self, owner: Pubkey) -> int:
        for attempt in range(4):
            try:
                r = await self._client.get_balance(owner)
                return int(r.value)
            except Exception as e:  # noqa: BLE001
                logger.warning("get_balance retry {}: {}", attempt, e)
                await exponential_backoff_sleep(attempt)
        raise RuntimeError("get_balance failed after retries")

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
                logger.warning("getTokenAccountsByOwner retry {}: {}", attempt, e)
                await exponential_backoff_sleep(attempt)
        raise RuntimeError("get_spl_balance_raw failed")

    async def simulate_v0(self, tx: VersionedTransaction) -> dict[str, Any]:
        enc = base64.b64encode(bytes(tx)).decode("ascii")
        res = await self._rpc_post(
            "simulateTransaction",
            [
                enc,
                {
                    "encoding": "base64",
                    "sigVerify": True,
                    "commitment": self._s.commitment,
                },
            ],
        )
        val = res.get("value") or {}
        return {
            "err": val.get("err"),
            "logs": val.get("logs"),
            "units_consumed": val.get("unitsConsumed"),
        }

    async def send_raw_transaction(self, tx: VersionedTransaction, skip_preflight: bool = False) -> str:
        opts = TxOpts(skip_preflight=skip_preflight, preflight_commitment=Confirmed)
        res = await self._client.send_transaction(tx, opts=opts)
        return str(res.value)


def pubkey_or_from_keypair(wallet: Optional[str], keypair: Optional[Keypair]) -> Pubkey:
    if wallet:
        return Pubkey.from_string(wallet)
    if keypair:
        return keypair.pubkey()
    raise ValueError("WALLET_ADDRESS or PRIVATE_KEY required for pubkey")


def raw_to_decimal_usdc(amount_raw: int, decimals: int) -> Decimal:
    scale = Decimal(10) ** decimals
    return Decimal(amount_raw) / scale
