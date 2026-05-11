from __future__ import annotations

import base64
from typing import Optional

import aiohttp
from loguru import logger
from solders.transaction import VersionedTransaction


class JitoBundleClient:
    """
    Optional Jito Block Engine bundle submit (JSON-RPC).

    HIGH RISK: Misconfiguration can leak txs or burn tips. Test on small size.
    """

    def __init__(self, session: aiohttp.ClientSession, block_engine_url: str) -> None:
        self._session = session
        self._url = block_engine_url

    async def send_bundle_base64(self, txs_b64: list[str]) -> Optional[str]:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "sendBundle",
            "params": [txs_b64],
        }
        try:
            async with self._session.post(
                self._url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=25),
            ) as r:
                js = await r.json()
                if "error" in js:
                    logger.warning("Jito bundle error: {}", js["error"])
                    return None
                return str(js.get("result"))
        except Exception as e:  # noqa: BLE001
            logger.warning("Jito bundle POST failed: {}", e)
            return None

    @staticmethod
    def tx_to_b64(tx: VersionedTransaction) -> str:
        return base64.b64encode(bytes(tx)).decode("ascii")
