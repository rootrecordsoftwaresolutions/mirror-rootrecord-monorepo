"""Correct Jupiter v0 signing (same approach as solana-arb-bot)."""

from __future__ import annotations

from solders.keypair import Keypair
from solders.presigner import Presigner
from solders.signature import Signature
from solders.transaction import VersionedTransaction


def sign_versioned_swap(tx: VersionedTransaction, keypair: Keypair) -> VersionedTransaction:
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
