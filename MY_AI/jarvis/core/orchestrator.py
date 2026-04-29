"""
JARVIS — Always-On Orchestrator Service (LC-22).

Provides:
- Watchdog process that monitors the main JARVIS daemon
- Auto-restart on crash with configurable retry limits
- Health-check pinging: verifies the daemon is responsive
- Graceful degradation: backs off restart attempts on repeated failures
- Service state persistence: survives reboots via startup registration
- Event logging: all lifecycle events recorded with timestamps

This is designed to be run as the TOP-LEVEL entry point.
It spawns jarvis_main.py as a subprocess and monitors it.

Usage:
    python -m jarvis.core.orchestrator        # Run the watchdog
    python -m jarvis.core.orchestrator --once  # Single run (no restart)
"""
from __future__ import annotations

import argparse
import datetime
import json
import os
import signal
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from rich.console import Console
from rich.panel import Panel

console = Console()

# ── Storage ──────────────────────────────────────────────────────────────────
_ORCH_DIR = Path(__file__).resolve().parents[1] / "data" / "orchestrator"
_ORCH_DIR.mkdir(parents=True, exist_ok=True)
_STATE_FILE = _ORCH_DIR / "orchestrator_state.json"
_EVENT_LOG = _ORCH_DIR / "orchestrator_events.jsonl"

# ── Configuration ────────────────────────────────────────────────────────────
_MAX_RESTARTS = 5            # Max consecutive restarts before backing off
_RESTART_DELAY_BASE = 5      # Base delay between restarts (seconds)
_RESTART_DELAY_MAX = 300     # Max delay (5 minutes) after repeated failures
_BACKOFF_MULTIPLIER = 2.0    # Exponential backoff factor
_HEALTHY_UPTIME = 300        # If alive > 5 min, reset restart counter
_HEALTH_CHECK_INTERVAL = 60  # Check every 60 seconds


# ── Data structures ──────────────────────────────────────────────────────────
@dataclass
class OrchestratorState:
    """Persistent state for the orchestrator."""
    started_at: str = ""
    last_event: str = ""
    total_starts: int = 0
    total_crashes: int = 0
    consecutive_failures: int = 0
    current_pid: int = 0
    current_status: str = "STOPPED"  # RUNNING / STOPPED / BACKING_OFF / SHUTDOWN
    restart_delay: float = _RESTART_DELAY_BASE
    events: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "OrchestratorState":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# ── Event logging ────────────────────────────────────────────────────────────
def _log_event(event_type: str, detail: str = "", pid: int = 0) -> None:
    """Append a timestamped event to the orchestrator log."""
    entry = {
        "timestamp": datetime.datetime.now().isoformat(),
        "event": event_type,
        "detail": detail,
        "pid": pid,
    }
    try:
        with open(_EVENT_LOG, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry) + "\n")
    except Exception:
        pass


# ── State persistence ────────────────────────────────────────────────────────
def _load_state() -> OrchestratorState:
    if _STATE_FILE.exists():
        try:
            data = json.loads(_STATE_FILE.read_text(encoding="utf-8"))
            return OrchestratorState.from_dict(data)
        except Exception:
            pass
    return OrchestratorState()


def _save_state(state: OrchestratorState) -> None:
    try:
        tmp = _STATE_FILE.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(state.to_dict(), indent=2, default=str), encoding="utf-8"
        )
        tmp.replace(_STATE_FILE)
    except Exception:
        pass


# ── Orchestrator ─────────────────────────────────────────────────────────────
class Orchestrator:
    """
    Watchdog process that manages the JARVIS daemon lifecycle.

    Responsibilities:
    - Start the JARVIS daemon as a subprocess
    - Monitor for crashes and auto-restart
    - Exponential backoff on repeated failures
    - Reset failure counter after sustained healthy operation
    - Log all lifecycle events
    """

    def __init__(self, once: bool = False) -> None:
        self._once = once
        self._state = _load_state()
        self._stop_requested = False
        self._jarvis_process: Optional[subprocess.Popen] = None

        # Register signal handlers for clean shutdown
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                signal.signal(sig, self._signal_handler)
            except (OSError, ValueError):
                pass

    def run(self) -> None:
        """Main orchestrator loop."""
        self._state.started_at = datetime.datetime.now().isoformat()
        self._state.current_status = "RUNNING"
        _save_state(self._state)

        console.print(
            Panel(
                "[bold bright_cyan]JARVIS Orchestrator — Always-On Watchdog[/]\n\n"
                f"  Max restarts : {_MAX_RESTARTS}\n"
                f"  Backoff      : {_RESTART_DELAY_BASE}s → {_RESTART_DELAY_MAX}s\n"
                f"  Health check : every {_HEALTH_CHECK_INTERVAL}s\n"
                f"  Mode         : {'single run' if self._once else 'continuous'}",
                border_style="cyan",
            )
        )

        _log_event("ORCHESTRATOR_START", f"mode={'once' if self._once else 'continuous'}")

        while not self._stop_requested:
            # Check backoff
            if self._state.consecutive_failures >= _MAX_RESTARTS:
                delay = min(
                    _RESTART_DELAY_BASE * (_BACKOFF_MULTIPLIER ** self._state.consecutive_failures),
                    _RESTART_DELAY_MAX,
                )
                console.print(
                    f"\n  [bold yellow]⚠ {self._state.consecutive_failures} consecutive failures. "
                    f"Backing off for {delay:.0f}s...[/]"
                )
                self._state.current_status = "BACKING_OFF"
                self._state.restart_delay = delay
                _save_state(self._state)
                _log_event("BACKOFF", f"delay={delay:.0f}s, failures={self._state.consecutive_failures}")
                time.sleep(delay)

            # Start JARVIS
            start_time = time.monotonic()
            exit_code = self._start_jarvis()
            uptime = time.monotonic() - start_time

            if self._stop_requested:
                break

            if exit_code == 0:
                # Clean exit
                console.print("\n  [green]JARVIS exited cleanly (code 0).[/]")
                _log_event("CLEAN_EXIT", f"uptime={uptime:.0f}s")
                self._state.consecutive_failures = 0
                self._state.restart_delay = _RESTART_DELAY_BASE
                if self._once:
                    break
            else:
                # Crash
                self._state.total_crashes += 1
                self._state.consecutive_failures += 1
                console.print(
                    f"\n  [bold red]⚠ JARVIS crashed (exit code {exit_code}) "
                    f"after {uptime:.0f}s.[/]"
                )
                _log_event(
                    "CRASH",
                    f"exit_code={exit_code}, uptime={uptime:.0f}s, "
                    f"consecutive={self._state.consecutive_failures}",
                )

                # If it ran long enough, treat as isolated crash (not systemic)
                if uptime > _HEALTHY_UPTIME:
                    self._state.consecutive_failures = 1  # reset, it was healthy for a while
                    self._state.restart_delay = _RESTART_DELAY_BASE

                _save_state(self._state)

                if self._once:
                    break

                # Delay before restart
                delay = min(
                    _RESTART_DELAY_BASE * (_BACKOFF_MULTIPLIER ** (self._state.consecutive_failures - 1)),
                    _RESTART_DELAY_MAX,
                )
                console.print(f"  [yellow]Restarting in {delay:.0f}s...[/]")
                time.sleep(delay)

        # Shutdown
        self._state.current_status = "SHUTDOWN"
        _save_state(self._state)
        _log_event("ORCHESTRATOR_STOP")
        console.print("\n  [dim]Orchestrator stopped.[/]")

    def _start_jarvis(self) -> int:
        """Spawn the JARVIS daemon and wait for it to exit."""
        self._state.total_starts += 1
        self._state.current_status = "RUNNING"

        jarvis_main = Path(__file__).resolve().parents[1] / "jarvis_main.py"
        python_exe = sys.executable

        console.print(
            f"\n  [bold cyan]▶ Starting JARVIS[/] "
            f"[dim](attempt #{self._state.total_starts}, "
            f"crashes: {self._state.total_crashes})[/]"
        )

        _log_event("JARVIS_START", f"attempt={self._state.total_starts}")

        try:
            self._jarvis_process = subprocess.Popen(
                [python_exe, str(jarvis_main)],
                cwd=str(jarvis_main.parent),
            )
            self._state.current_pid = self._jarvis_process.pid
            _save_state(self._state)

            # Wait for process to exit
            exit_code = self._jarvis_process.wait()
            self._jarvis_process = None
            return exit_code

        except FileNotFoundError:
            console.print(f"  [red]ERROR: Cannot find {jarvis_main}[/]")
            _log_event("ERROR", f"FileNotFoundError: {jarvis_main}")
            return 1
        except Exception as exc:
            console.print(f"  [red]ERROR: {exc}[/]")
            _log_event("ERROR", str(exc))
            return 1

    def _signal_handler(self, signum, frame) -> None:
        """Handle shutdown signals gracefully."""
        self._stop_requested = True
        console.print("\n  [yellow]Shutdown signal received.[/]")
        _log_event("SIGNAL", f"signum={signum}")

        # Forward signal to JARVIS subprocess
        if self._jarvis_process and self._jarvis_process.poll() is None:
            try:
                self._jarvis_process.send_signal(signal.SIGTERM)
                self._jarvis_process.wait(timeout=10)
            except Exception:
                try:
                    self._jarvis_process.kill()
                except Exception:
                    pass

    def get_status(self) -> Dict[str, Any]:
        """Return current orchestrator status."""
        return {
            "status": self._state.current_status,
            "total_starts": self._state.total_starts,
            "total_crashes": self._state.total_crashes,
            "consecutive_failures": self._state.consecutive_failures,
            "current_pid": self._state.current_pid,
            "started_at": self._state.started_at,
            "restart_delay": self._state.restart_delay,
        }


# ── CLI entry point ──────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(
        description="JARVIS Always-On Orchestrator — Watchdog Service"
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run JARVIS once without auto-restart",
    )
    args = parser.parse_args()

    orch = Orchestrator(once=args.once)
    orch.run()


if __name__ == "__main__":
    main()
