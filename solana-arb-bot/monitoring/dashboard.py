from __future__ import annotations

import asyncio
from typing import Any, Callable

from fastapi import FastAPI
from rich.console import Console
from rich.live import Live
from rich.table import Table


class Dashboard:
    """Console Rich table + optional FastAPI JSON snapshot."""

    def __init__(self, snapshot_fn: Callable[[], dict[str, Any]], refresh_sec: float = 4.0) -> None:
        self._snapshot_fn = snapshot_fn
        self._refresh_sec = refresh_sec
        self._stop = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()

    def _build_table(self, snap: dict[str, Any]) -> Table:
        t = Table(title="Solana arb bot")
        t.add_column("Field", style="cyan")
        t.add_column("Value", style="white")
        st = snap.get("stats") or {}
        t.add_row("watchlist_len", str(snap.get("watchlist_len")))
        t.add_row("blacklist_len", str(snap.get("blacklist_len")))
        t.add_row("scans", str(st.get("scans")))
        t.add_row("opportunities", str(st.get("opportunities")))
        t.add_row("executions", str(st.get("executions")))
        lb = st.get("last_best")
        t.add_row("last_best", repr(lb))
        risk = snap.get("risk") or {}
        t.add_row("emergency_stop", str(risk.get("emergency_stop")))
        t.add_row("pnl_today_usd", str(risk.get("realized_pnl_usd_today")))
        wl = snap.get("watchlist_head") or []
        t.add_row("watchlist_head", ", ".join(x[:6] for x in wl[:12]))
        return t

    async def run_console(self) -> None:
        console = Console()
        with Live(console=console, refresh_per_second=0.5, screen=False) as live:
            while not self._stop.is_set():
                snap = self._snapshot_fn()
                live.update(self._build_table(snap))
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=self._refresh_sec)
                    break
                except TimeoutError:
                    continue

    async def run_loop(self) -> None:
        await self.run_console()


def build_fastapi_app(snapshot_fn: Callable[[], dict[str, Any]]) -> FastAPI:
    app = FastAPI(title="Solana Arb Bot", version="0.1.0")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/snapshot")
    async def snapshot() -> dict[str, Any]:
        return snapshot_fn()

    return app


async def run_http_dashboard(
    snapshot_fn: Callable[[], dict[str, Any]],
    host: str,
    port: int,
    stop_event: asyncio.Event,
) -> None:
    import uvicorn

    app = build_fastapi_app(snapshot_fn)
    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    t = asyncio.create_task(server.serve())
    await stop_event.wait()
    server.should_exit = True
    await t
