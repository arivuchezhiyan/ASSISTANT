"""
JARVIS — Crash Recovery & Resumable Checkpoints (LC-18).

Provides:
- Periodic session state snapshots saved to disk
- Unclean-shutdown detection on next boot (stale lock file)
- Session resume: restore conversation history + context after a crash
- Graceful shutdown marker so normal exits don't trigger recovery

Design:
  checkpoint_dir/
    session.lock          ← exists while JARVIS is running (PID + timestamp)
    latest_checkpoint.json← most recent state snapshot
    history/
      checkpoint_<iso>.json ← older snapshots (pruned to last 10)
"""
from __future__ import annotations

import atexit
import datetime
import json
import os
import signal
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from rich.console import Console

console = Console()

# ── Storage ──────────────────────────────────────────────────────────────────
_CHECKPOINT_DIR = Path(__file__).resolve().parents[1] / "data" / "checkpoints"
_CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
_HISTORY_DIR = _CHECKPOINT_DIR / "history"
_HISTORY_DIR.mkdir(parents=True, exist_ok=True)

_LOCK_FILE = _CHECKPOINT_DIR / "session.lock"
_LATEST_CP = _CHECKPOINT_DIR / "latest_checkpoint.json"
_CLEAN_EXIT = _CHECKPOINT_DIR / ".clean_exit"

# Maximum checkpoint history files to retain
_MAX_HISTORY = 10

# Default checkpoint interval in seconds
_DEFAULT_INTERVAL_SEC = 120  # 2 minutes


# ── Data structures ──────────────────────────────────────────────────────────
@dataclass
class CheckpointData:
    """Serializable snapshot of a JARVIS session state."""

    session_id: str = ""
    timestamp: str = ""
    pid: int = 0
    conversation_history: List[Dict[str, str]] = field(default_factory=list)
    memory_count: int = 0
    commands_processed: int = 0
    uptime_seconds: float = 0.0
    wake_word: str = "hey jarvis"
    model_name: str = ""
    last_user_input: str = ""
    last_jarvis_response: str = ""
    custom_state: Dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2, default=str)

    @classmethod
    def from_json(cls, raw: str) -> "CheckpointData":
        data = json.loads(raw)
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


# ── Lock-file helpers ────────────────────────────────────────────────────────
def _write_lock(session_id: str) -> None:
    """Create a lock file indicating JARVIS is running."""
    payload = {
        "pid": os.getpid(),
        "session_id": session_id,
        "started_at": datetime.datetime.now().isoformat(),
    }
    _LOCK_FILE.write_text(json.dumps(payload), encoding="utf-8")


def _remove_lock() -> None:
    """Remove lock file on clean shutdown."""
    try:
        _LOCK_FILE.unlink(missing_ok=True)
    except Exception:
        pass


def _read_lock() -> Optional[Dict[str, Any]]:
    """Read existing lock file if present."""
    if not _LOCK_FILE.exists():
        return None
    try:
        return json.loads(_LOCK_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None


def _is_pid_alive(pid: int) -> bool:
    """Check whether a PID is still running (Windows-safe)."""
    try:
        import psutil

        return psutil.pid_exists(pid)
    except ImportError:
        # Fallback: try os.kill with signal 0
        try:
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False


def _mark_clean_exit() -> None:
    """Write a marker indicating clean exit."""
    _CLEAN_EXIT.write_text(
        datetime.datetime.now().isoformat(), encoding="utf-8"
    )


def _clear_clean_exit() -> None:
    """Remove clean exit marker (called on startup)."""
    try:
        _CLEAN_EXIT.unlink(missing_ok=True)
    except Exception:
        pass


# ── Checkpoint Manager ───────────────────────────────────────────────────────
class CheckpointManager:
    """
    Manages periodic session checkpointing, crash detection and session resume.

    Usage:
        mgr = CheckpointManager(session_id="uuid")
        crashed, old_data = mgr.detect_crash()
        if crashed:
            # offer resume ...
        mgr.start()  # begins periodic checkpointing
        ...
        mgr.shutdown()  # clean exit
    """

    def __init__(
        self,
        session_id: str = "",
        interval_sec: float = _DEFAULT_INTERVAL_SEC,
    ) -> None:
        self._session_id = session_id or self._gen_session_id()
        self._interval = interval_sec
        self._timer: Optional[threading.Timer] = None
        self._lock = threading.Lock()
        self._started = False
        self._start_time = time.monotonic()
        self._commands_processed = 0

        # Holders — callers set these before each checkpoint cycle
        self.conversation_history: List[Dict[str, str]] = []
        self.memory_count: int = 0
        self.wake_word: str = "hey jarvis"
        self.model_name: str = ""
        self.last_user_input: str = ""
        self.last_jarvis_response: str = ""
        self.custom_state: Dict[str, Any] = {}

    # ── public API ────────────────────────────────────────────────────────
    @property
    def session_id(self) -> str:
        return self._session_id

    def detect_crash(self) -> tuple[bool, Optional[CheckpointData]]:
        """
        Call BEFORE start().  Returns (was_crash, checkpoint_data).
        A crash is detected when a lock file exists whose PID is dead
        AND no clean-exit marker is present.
        """
        lock_info = _read_lock()
        if lock_info is None:
            _clear_clean_exit()
            return False, None

        pid = lock_info.get("pid", -1)
        clean = _CLEAN_EXIT.exists()

        if clean or _is_pid_alive(pid):
            # Either exited cleanly or still running (another instance)
            _clear_clean_exit()
            return False, None

        # Crash detected — try to load last checkpoint
        console.print(
            "\n  [bold red]⚠  CRASH DETECTED[/]  "
            f"[dim]Previous session (PID {pid}) did not exit cleanly.[/]"
        )
        cp_data = self._load_latest()
        _clear_clean_exit()
        return True, cp_data

    def start(self) -> None:
        """Begin periodic checkpointing and register shutdown hooks."""
        if self._started:
            return
        self._started = True
        self._start_time = time.monotonic()

        # Write session lock
        _write_lock(self._session_id)
        _clear_clean_exit()

        # Register cleanup on normal exit & signals
        atexit.register(self.shutdown)
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(sig, self._signal_handler)
            except (OSError, ValueError):
                pass  # some signals can't be caught on Windows

        # First checkpoint immediately
        self._schedule_next()
        console.print(
            f"  [dim green]Checkpoint engine armed — "
            f"snapshots every {int(self._interval)}s.[/]"
        )

    def record_command(self) -> None:
        """Increment command counter (call after each user command)."""
        self._commands_processed += 1

    def save_now(self) -> None:
        """Force an immediate checkpoint."""
        self._do_checkpoint()

    def shutdown(self) -> None:
        """Clean shutdown — final checkpoint, remove lock, write marker."""
        if not self._started:
            return
        self._started = False
        # Cancel pending timer
        if self._timer:
            self._timer.cancel()
            self._timer = None
        # Final snapshot
        self._do_checkpoint()
        _remove_lock()
        _mark_clean_exit()

    def get_latest_checkpoint(self) -> Optional[CheckpointData]:
        """Load the most recent checkpoint from disk."""
        return self._load_latest()

    # ── internal ──────────────────────────────────────────────────────────
    @staticmethod
    def _gen_session_id() -> str:
        import uuid
        return uuid.uuid4().hex[:12]

    def _signal_handler(self, signum, frame) -> None:  # noqa: ANN001
        self.shutdown()
        raise SystemExit(0)

    def _schedule_next(self) -> None:
        if not self._started:
            return
        self._timer = threading.Timer(self._interval, self._tick)
        self._timer.daemon = True
        self._timer.start()

    def _tick(self) -> None:
        self._do_checkpoint()
        self._schedule_next()

    def _do_checkpoint(self) -> None:
        with self._lock:
            now_iso = datetime.datetime.now().isoformat()
            cp = CheckpointData(
                session_id=self._session_id,
                timestamp=now_iso,
                pid=os.getpid(),
                conversation_history=list(self.conversation_history),
                memory_count=self.memory_count,
                commands_processed=self._commands_processed,
                uptime_seconds=round(time.monotonic() - self._start_time, 1),
                wake_word=self.wake_word,
                model_name=self.model_name,
                last_user_input=self.last_user_input,
                last_jarvis_response=self.last_jarvis_response,
                custom_state=dict(self.custom_state),
            )
            payload = cp.to_json()

            try:
                # Write latest checkpoint (atomic-ish: write tmp then rename)
                tmp = _LATEST_CP.with_suffix(".tmp")
                tmp.write_text(payload, encoding="utf-8")
                tmp.replace(_LATEST_CP)

                # Archive to history
                safe_ts = now_iso.replace(":", "-")
                hist_file = _HISTORY_DIR / f"checkpoint_{safe_ts}.json"
                hist_file.write_text(payload, encoding="utf-8")

                # Prune old history files
                self._prune_history()
            except Exception as exc:
                console.print(f"  [yellow]Checkpoint write error: {exc}[/]")

    def _load_latest(self) -> Optional[CheckpointData]:
        if not _LATEST_CP.exists():
            return None
        try:
            raw = _LATEST_CP.read_text(encoding="utf-8")
            return CheckpointData.from_json(raw)
        except Exception as exc:
            console.print(f"  [yellow]Checkpoint load error: {exc}[/]")
            return None

    @staticmethod
    def _prune_history() -> None:
        """Keep only the most recent _MAX_HISTORY checkpoint files."""
        files = sorted(_HISTORY_DIR.glob("checkpoint_*.json"))
        while len(files) > _MAX_HISTORY:
            oldest = files.pop(0)
            try:
                oldest.unlink()
            except Exception:
                pass
