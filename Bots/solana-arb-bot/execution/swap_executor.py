from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Optional

from loguru import logger
from solders.keypair import Keypair
from solders.presigner import Presigner
from solders.signature import Signature
from solders.transaction import VersionedTransaction

from config.settings import Settings
from core.jupiter_client import JupiterClient, QuotePair
from core.rpc_client import SolanaRpcClient
from execution.jito_bundle import JitoBundleClient
from utils.helpers import utc_now_iso


def _sign_versioned(tx: VersionedTransaction, keypair: Keypair) -> VersionedTransaction:
    """
    Re-sign Jupiter's deserialized v0 swap tx.

    Do not use ``sign_message(bytes(message))`` + ``populate``: that payload is not what
    Solana verifies on-chain. ``VersionedTransaction(message, [keypair])`` matches the
    runtime's expected signing (see ``verify_with_results``).
    """
    msg = tx.message
    req = int(msg.header.num_required_signatures)
    keys = msg.account_keys
    payer = keypair.pubkey()

    if req == 1:
        return VersionedTransaction(msg, [keypair])

    sigs = list(tx.signatures)
    while len(sigs) < req:
        sigs.append(Signature.default())
    signers: list[Keypair | Presigner] = []
    for i in range(req):
        pk = keys[i]
        if pk == payer:
            signers.append(keypair)
        else:
            signers.append(Presigner(pk, sigs[i]))
    return VersionedTransaction(msg, signers)


class SwapExecutor:
    """
    Build swap txs from Jupiter quotes, simulate, optionally send.

    WARNING: Two sequential swaps are NOT atomic; you can end up holding inventory if leg2 fails.
    """

    def __init__(self, settings: Settings, rpc: SolanaRpcClient, jupiter: JupiterClient) -> None:
        self._s = settings
        self._rpc = rpc
        self._jup = jupiter
        self._log_path: Path = settings.trade_log_path

    def _append_trade_log(self, row: dict) -> None:
        self._log_path.parent.mkdir(parents=True, exist_ok=True)
        with self._log_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, default=str) + "\n")

    async def _build_sign_sim(
        self,
        quote: dict,
        user_pk: str,
        keypair: Optional[Keypair],
        label: str,
    ) -> tuple[Optional[VersionedTransaction], dict]:
        body = await self._jup.swap_transaction(quote, user_pk)
        if not body or not body.get("swapTransaction"):
            logger.warning("No swapTransaction for {}", label)
            return None, {"err": "no_swap_tx"}
        raw = base64.b64decode(body["swapTransaction"])
        tx = VersionedTransaction.from_bytes(raw)
        if keypair is None:
            return None, {"skipped": True}
        signed = _sign_versioned(tx, keypair)
        sim = await self._rpc.simulate_v0(signed)
        logger.info("Sim {} err={} cu={}", label, sim.get("err"), sim.get("units_consumed"))
        return signed, sim

    async def execute_round_trip_sequential(
        self,
        qp: QuotePair,
        user_pk: str,
        keypair: Optional[Keypair],
    ) -> bool:
        """Simulate both legs; if DRY_RUN, stop after sim. Else send leg1 then leg2."""
        if keypair is None:
            if self._s.dry_run:
                logger.warning(
                    "DRY_RUN without PRIVATE_KEY: quote-only (no swap simulation) token={}",
                    qp.token_mint[:12],
                )
                self._append_trade_log(
                    {
                        "ts": utc_now_iso(),
                        "token": qp.token_mint,
                        "dry_run": True,
                        "note": "quote_only_no_keypair",
                        "fwd_out": qp.forward.get("outAmount"),
                        "rev_out": qp.reverse.get("outAmount"),
                    }
                )
                return True
            logger.error("Live trading requires PRIVATE_KEY")
            return False

        tx1, s1 = await self._build_sign_sim(qp.forward, user_pk, keypair, "leg1")
        if s1.get("err"):
            self._append_trade_log(
                {
                    "ts": utc_now_iso(),
                    "token": qp.token_mint,
                    "leg": 1,
                    "dry_run": self._s.dry_run,
                    "sim_err": s1.get("err"),
                }
            )
            return False
        tx2, s2 = await self._build_sign_sim(qp.reverse, user_pk, keypair, "leg2")
        if s2.get("err"):
            self._append_trade_log(
                {
                    "ts": utc_now_iso(),
                    "token": qp.token_mint,
                    "leg": 2,
                    "dry_run": self._s.dry_run,
                    "sim_err": s2.get("err"),
                }
            )
            return False

        if self._s.dry_run:
            self._append_trade_log(
                {
                    "ts": utc_now_iso(),
                    "token": qp.token_mint,
                    "dry_run": True,
                    "note": "sim_ok",
                    "fwd_out": qp.forward.get("outAmount"),
                    "rev_out": qp.reverse.get("outAmount"),
                }
            )
            logger.success("DRY_RUN round-trip simulations OK for {}", qp.token_mint[:12])
            return True

        assert tx1 is not None and tx2 is not None
        try:
            sig1 = await self._rpc.send_raw_transaction(tx1)
            logger.info("Sent leg1 sig={}", sig1)
            sig2 = await self._rpc.send_raw_transaction(tx2)
            logger.info("Sent leg2 sig={}", sig2)
            self._append_trade_log(
                {
                    "ts": utc_now_iso(),
                    "token": qp.token_mint,
                    "dry_run": False,
                    "sig1": sig1,
                    "sig2": sig2,
                }
            )
            return True
        except Exception as e:  # noqa: BLE001
            logger.exception("send_transaction: {}", e)
            self._append_trade_log({"ts": utc_now_iso(), "token": qp.token_mint, "send_err": str(e)})
            return False

    async def execute_round_trip_jito(
        self,
        qp: QuotePair,
        user_pk: str,
        keypair: Keypair,
        jito: JitoBundleClient,
    ) -> bool:
        tx1, s1 = await self._build_sign_sim(qp.forward, user_pk, keypair, "leg1")
        if s1.get("err") or tx1 is None:
            return False
        tx2, s2 = await self._build_sign_sim(qp.reverse, user_pk, keypair, "leg2")
        if s2.get("err") or tx2 is None:
            return False
        if self._s.dry_run:
            logger.success("DRY_RUN: Jito bundle would include 2 txs for {}", qp.token_mint[:12])
            return True
        b1 = jito.tx_to_b64(tx1)
        b2 = jito.tx_to_b64(tx2)
        bid = await jito.send_bundle_base64([b1, b2])
        self._append_trade_log({"ts": utc_now_iso(), "token": qp.token_mint, "jito_bundle": bid})
        return bid is not None
