"""
Solana Jupiter-oriented arb bot — entry point.

HIGH RISK: You can lose funds to bugs, slippage, MEV, failed txs, and market moves.
Start on devnet / DRY_RUN. Never deploy with more capital than you can afford to lose.
"""

from __future__ import annotations

import asyncio
import signal
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import aiohttp
from loguru import logger

from config.settings import get_settings
from core.arbitrage_engine import ArbitrageEngine
from core.jupiter_client import JupiterClient
from core.rpc_client import SolanaRpcClient
from discovery.pair_filter import PairFilter
from discovery.token_discovery import TokenDiscovery
from execution.jito_bundle import JitoBundleClient
from execution.swap_executor import SwapExecutor
from monitoring.dashboard import Dashboard, run_http_dashboard
from monitoring.notifier import Notifier
from utils.risk import RiskManager


def setup_logging() -> None:
    logger.remove()
    logger.add(
        sys.stderr,
        colorize=True,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan> - <level>{message}</level>",
        level="INFO",
    )
    log_path = ROOT / "data" / "bot.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger.add(log_path, rotation="20 MB", retention="10 days", level="DEBUG")


async def amain() -> None:
    setup_logging()
    settings = get_settings()
    errs = settings.validate()
    if errs:
        for e in errs:
            logger.error("Config: {}", e)
        raise SystemExit(1)

    stop = asyncio.Event()

    def _handle_sig(*_: object) -> None:
        logger.warning("Shutdown signal received")
        stop.set()

    try:
        signal.signal(signal.SIGINT, _handle_sig)
        signal.signal(signal.SIGTERM, _handle_sig)
    except (AttributeError, ValueError):
        pass

    connector = aiohttp.TCPConnector(limit=32, limit_per_host=16, ttl_dns_cache=300)
    client_timeout = aiohttp.ClientTimeout(total=90, connect=25)
    async with aiohttp.ClientSession(connector=connector, timeout=client_timeout) as session:
        rpc = SolanaRpcClient(settings, session)
        jupiter = JupiterClient(settings, session)
        discovery = TokenDiscovery(settings, session)
        pair_filter = PairFilter(settings)
        risk = RiskManager(settings)
        notifier = Notifier(settings, session)
        await notifier.send(
            f"Bot starting dry_run={settings.dry_run} rpc={settings.solana_rpc_url[:48]}…",
            silent=True,
        )
        swap_ex = SwapExecutor(settings, rpc, jupiter)
        jito = JitoBundleClient(session, settings.jito_block_engine_url) if settings.use_jito_bundle else None
        engine = ArbitrageEngine(
            settings,
            rpc,
            jupiter,
            discovery,
            pair_filter,
            risk,
            notifier,
            swap_ex,
            jito,
            session,
        )

        dash = Dashboard(engine.snapshot, refresh_sec=4.0)
        tasks: list[asyncio.Task] = [asyncio.create_task(dash.run_console())]

        if settings.enable_http_dashboard:
            tasks.append(
                asyncio.create_task(
                    run_http_dashboard(
                        engine.snapshot,
                        settings.dashboard_host,
                        settings.dashboard_port,
                        stop,
                    )
                )
            )

        try:
            while not stop.is_set():
                if risk.state.emergency_stop:
                    logger.error("Emergency stop active: {}", risk.state.emergency_reason)
                    await asyncio.sleep(5)
                    continue
                try:
                    ops = await engine.scan_once()
                except Exception as e:  # noqa: BLE001
                    logger.exception("scan_once: {}", e)
                    risk.note_rpc_error()
                    await asyncio.sleep(3)
                    continue

                if ops and not risk.state.emergency_stop:
                    await engine.execute_best(ops[0])

                try:
                    await asyncio.wait_for(stop.wait(), timeout=settings.scan_interval_sec)
                except TimeoutError:
                    pass
        finally:
            dash.stop()
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            await rpc.close()

    logger.info("Bot stopped cleanly")


def main() -> None:
    asyncio.run(amain())


if __name__ == "__main__":
    main()
