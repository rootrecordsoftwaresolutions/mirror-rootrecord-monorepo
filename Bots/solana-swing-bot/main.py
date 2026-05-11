"""
Solana swing bot — dual MA on Jupiter-implied prices, optional single-leg swaps.

Same wallet/env pattern as solana-arb-bot (Development/Web/credentials.env + project .env).
HIGH RISK: directional trades can lose quickly. Start with DRY_RUN=true.
"""

from __future__ import annotations

import asyncio
import base64
import signal
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import aiohttp
from loguru import logger
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.transaction import VersionedTransaction

from config.settings import Settings, get_settings
from core.jupiter import JupiterLite
from core.rpc_client import SolanaRpcClient, pubkey_from_wallet_or_key
from core.sign_tx import sign_versioned_swap
from core.state_store import SwingState
from strategy.trend_ma import MASwingStrategy
from utils.helpers import load_keypair, utc_now_iso

SOL_MINT = "So11111111111111111111111111111111111111112"


def setup_logging() -> None:
    logger.remove()
    logger.add(
        sys.stderr,
        colorize=True,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>",
        level="INFO",
    )
    p = ROOT / "data" / "swing.log"
    p.parent.mkdir(parents=True, exist_ok=True)
    logger.add(p, rotation="20 MB", retention="7 days", level="DEBUG")


def compute_buy_usdc_raw(s: Settings, usdc_balance_raw: int) -> int:
    """USDC amount to swap (raw, 6 decimals): pct of balance, clamped min/max, never above wallet."""
    if usdc_balance_raw <= 0:
        return 0
    dec = float(10**s.base_decimals)
    bal_usdc = usdc_balance_raw / dec
    target_usdc = bal_usdc * s.position_pct_of_usdc
    target_usdc = max(s.position_min_usdc, min(s.position_max_usdc, target_usdc))
    target_usdc = min(target_usdc, bal_usdc)
    raw = int(round(target_usdc * dec))
    raw = min(max(0, raw), usdc_balance_raw)
    return raw if raw >= 1 else 0


def compute_sell_sol_lamports(s: Settings, sol_wallet_lamports: int) -> int:
    """Lamports to swap to USDC: fraction of (balance − reserve)."""
    spendable = max(0, sol_wallet_lamports - s.sol_reserve_lamports)
    return max(0, int(spendable * s.sell_pct_of_spendable_sol))


def mid_price_usdc_per_quote(s: Settings, q: dict) -> float:
    ain = int(q.get("inAmount", 0))
    aout = int(q.get("outAmount", 0))
    if ain <= 0 or aout <= 0:
        raise ValueError("invalid quote amounts")
    usdc = ain / float(10**s.base_decimals)
    tok = aout / float(10**s.quote_decimals)
    return usdc / tok


async def quote_and_swap(
    s: Settings,
    jup: JupiterLite,
    rpc: SolanaRpcClient,
    keypair: Keypair | None,
    owner_pk: str,
    input_mint: str,
    output_mint: str,
    amount_in_raw: int,
    label: str,
) -> bool:
    if keypair is None:
        logger.warning("Skipping {} (no PRIVATE_KEY)", label)
        return False
    q = await jup.quote(input_mint, output_mint, amount_in_raw)
    if not q or not q.get("outAmount"):
        logger.warning("No quote for {}", label)
        return False
    body = await jup.swap_transaction(q, owner_pk)
    if not body or not body.get("swapTransaction"):
        logger.warning("No swapTransaction for {}", label)
        return False
    raw = base64.b64decode(body["swapTransaction"])
    tx = VersionedTransaction.from_bytes(raw)
    signed = sign_versioned_swap(tx, keypair)
    sim = await rpc.simulate_v0(signed)
    if sim.get("err"):
        logger.warning("Sim {} err={}", label, sim.get("err"))
        return False
    logger.info("Sim {} OK cu={}", label, sim.get("units_consumed"))
    if s.dry_run:
        return True
    sig = await rpc.send_raw_transaction(signed)
    logger.success("Sent {} sig={}", label, sig)
    return True


async def run_loop(s: Settings, stop: asyncio.Event) -> None:
    strategy = MASwingStrategy(s.fast_sma, s.slow_sma)
    state = SwingState.from_path(s.state_path)
    kp: Keypair | None = load_keypair(s.private_key) if s.private_key else None
    owner = pubkey_from_wallet_or_key(s.wallet_address, kp)
    owner_str = str(owner)

    connector = aiohttp.TCPConnector(limit=24)
    async with aiohttp.ClientSession(connector=connector) as session:
        jup = JupiterLite(s, session)
        rpc = SolanaRpcClient(s, session)
        try:
            probe_raw = max(1, int(round(s.price_probe_usdc * (10**s.base_decimals))))
            while not stop.is_set():
                try:
                    pq = await jup.quote(s.base_mint, s.quote_mint, probe_raw)
                    if not pq or not pq.get("outAmount"):
                        logger.warning("Price probe quote failed")
                    else:
                        px = mid_price_usdc_per_quote(s, pq)
                        step = strategy.update(px, state.in_position)
                        sig = step.signal
                        logger.info(
                            "Price ~${:.4f} | bars={} | signal={} | in_position={}",
                            px,
                            step.bars,
                            sig,
                            state.in_position,
                        )
                        logger.info("Planned move — {}", step.planned_move)
                        if step.fast_sma is not None and step.slow_sma is not None:
                            logger.debug("MA fast={:.6f} slow={:.6f}", step.fast_sma, step.slow_sma)

                        if sig == "BUY" and not state.in_position:
                            logger.info("Executing planned move: BUY (USDC → quote)")
                            base_pk = Pubkey.from_string(s.base_mint)
                            usdc_bal_raw = await rpc.get_spl_balance_raw(owner, base_pk)
                            amt = compute_buy_usdc_raw(s, usdc_bal_raw)
                            ok = False
                            if amt < 1:
                                logger.warning(
                                    "BUY skipped: USDC sizing raw={} (balance too low vs min/pct)",
                                    usdc_bal_raw,
                                )
                            else:
                                logger.info(
                                    "BUY size {} micro-USDC (~${:.4f}) pct={:.2%} min/max ${}/${} balance_raw={}",
                                    amt,
                                    amt / float(10**s.base_decimals),
                                    s.position_pct_of_usdc,
                                    s.position_min_usdc,
                                    s.position_max_usdc,
                                    usdc_bal_raw,
                                )
                                ok = await quote_and_swap(
                                    s, jup, rpc, kp, owner_str, s.base_mint, s.quote_mint, amt, "BUY USDC→token"
                                )
                            if ok:
                                state.in_position = True
                                state.last_signal = "BUY"
                                state.save(s.state_path)
                                logger.success("BUY leg complete (dry_run={})", s.dry_run)

                        elif sig == "SELL" and state.in_position:
                            if s.quote_mint != SOL_MINT:
                                logger.warning(
                                    "SELL signal but auto-exit only wired for SOL; mint={} — flatten manually or extend bot",
                                    s.quote_mint[:8],
                                )
                            elif kp is None:
                                logger.error("SELL skipped: no PRIVATE_KEY")
                            else:
                                lamports = await rpc.get_sol_balance_lamports(owner)
                                sell_raw = compute_sell_sol_lamports(s, lamports)
                                if sell_raw <= 0:
                                    logger.warning("SELL skipped: SOL balance below reserve")
                                else:
                                    logger.info(
                                        "SELL size {} lamports (~{:.4f} SOL spendable) pct_of_spendable={:.0%} reserve_lamports={}",
                                        sell_raw,
                                        sell_raw / 1e9,
                                        s.sell_pct_of_spendable_sol,
                                        s.sol_reserve_lamports,
                                    )
                                    logger.info("Executing planned move: SELL (quote → USDC)")
                                    ok = await quote_and_swap(
                                        s,
                                        jup,
                                        rpc,
                                        kp,
                                        owner_str,
                                        s.quote_mint,
                                        s.base_mint,
                                        sell_raw,
                                        "SELL token→USDC",
                                    )
                                    if ok:
                                        state.in_position = False
                                        state.last_signal = "SELL"
                                        state.save(s.state_path)
                                        logger.success("SELL leg complete (dry_run={})", s.dry_run)
                except Exception as e:  # noqa: BLE001
                    logger.exception("tick error: {}", e)

                try:
                    await asyncio.wait_for(stop.wait(), timeout=s.loop_interval_sec)
                except asyncio.TimeoutError:
                    pass
        finally:
            await rpc.close()


async def amain() -> None:
    setup_logging()
    s = get_settings()
    logger.info(
        "solana-swing-bot dry_run={} pair {}→{} loop={}s MA {}/{}",
        s.dry_run,
        s.base_mint[:8],
        s.quote_mint[:8],
        s.loop_interval_sec,
        s.fast_sma,
        s.slow_sma,
    )
    logger.info(
        "Jupiter tip cap: priority={} max_lamports={} (~{:.6f} SOL ceiling) — tune SWING_* in .env",
        s.jupiter_priority_level,
        s.jupiter_priority_max_lamports,
        s.jupiter_priority_max_lamports / 1e9,
    )

    stop = asyncio.Event()

    def _handle_sig(*_: object) -> None:
        logger.warning("Shutdown signal")
        stop.set()

    try:
        signal.signal(signal.SIGINT, _handle_sig)
        signal.signal(signal.SIGTERM, _handle_sig)
    except (AttributeError, ValueError):
        pass

    await run_loop(s, stop)
    logger.info("Stopped at {}", utc_now_iso())


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
