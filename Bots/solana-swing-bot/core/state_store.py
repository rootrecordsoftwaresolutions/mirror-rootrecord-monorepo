from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any


@dataclass
class SwingState:
    """Persisted position flag so restarts do not blindly re-buy."""

    in_position: bool = False
    last_signal: str = "HOLD"

    @staticmethod
    def from_path(path: Path) -> "SwingState":
        if not path.is_file():
            return SwingState()
        try:
            raw: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
            return SwingState(
                in_position=bool(raw.get("in_position", False)),
                last_signal=str(raw.get("last_signal", "HOLD")),
            )
        except (json.JSONDecodeError, OSError, TypeError):
            return SwingState()

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=2), encoding="utf-8")
