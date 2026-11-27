"""Emergency Stop — global kill switch for JARVIS autonomous execution.

When activated, all ongoing and future JARVIS task execution halts immediately.
Can only be reset explicitly by the user. State is persisted so it survives
process restarts.
"""

from __future__ import annotations

import json
from pathlib import Path
import threading
import time


class EmergencyStop:
    """Thread-safe emergency stop flag with persistence."""

    def __init__(self, state_file: str | Path | None = None) -> None:
        self.state_file = Path(state_file) if state_file else Path.home() / ".arena-pc-control" / "emergency_stop.json"
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._stopped = self._load()

    def _load(self) -> bool:
        try:
            data = json.loads(self.state_file.read_text(encoding="utf-8"))
            return bool(data.get("stopped", False))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return False

    def _save(self) -> None:
        try:
            self.state_file.write_text(
                json.dumps({"stopped": self._stopped, "updated_at": time.time()}, indent=2),
                encoding="utf-8",
            )
        except OSError:
            pass

    @property
    def is_stopped(self) -> bool:
        with self._lock:
            return self._stopped

    def activate(self, reason: str = "user_requested") -> None:
        """Activate the emergency stop. All execution must halt."""
        with self._lock:
            self._stopped = True
        self._save()
        # Audit event
        try:
            from pathlib import Path as _P
            audit = _P.home() / ".arena-pc-control" / "audit.jsonl"
            with open(audit, "a", encoding="utf-8") as fh:
                fh.write(
                    json.dumps(
                        {
                            "ts": time.time(),
                            "event": "emergency_stop_activated",
                            "reason": reason,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
        except OSError:
            pass

    def reset(self, authorized_by: str = "user") -> None:
        """Reset the emergency stop. Requires explicit user authorization."""
        with self._lock:
            self._stopped = False
        self._save()

    def require_running(self) -> None:
        """Raise if emergency stop is active."""
        if self.is_stopped:
            raise RuntimeError(
                "JARVIS EMERGENCY STOP is ACTIVE. All autonomous execution is halted. "
                "Reset with jarvis emergency-stop --reset before continuing."
            )
