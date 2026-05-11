"""
Backtesting stub: historical Jupiter quotes are not freely bulk-exported.

Extend this module to:
- Load archived quote snapshots you logged from `data/trades.jsonl`
- Replay slippage / latency assumptions against stored routes
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class BacktestStub:
    trades_path: Path

    def load_jsonl(self, limit: int = 500) -> list[dict[str, Any]]:
        if not self.trades_path.is_file():
            return []
        rows: list[dict[str, Any]] = []
        with self.trades_path.open(encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                import json

                rows.append(json.loads(line))
                if len(rows) >= limit:
                    break
        return rows

    def summarize(self) -> dict[str, Any]:
        rows = self.load_jsonl()
        return {"rows": len(rows), "note": "stub — add your own replay metrics"}
