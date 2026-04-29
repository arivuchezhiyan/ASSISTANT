"""
JARVIS — Benchmark Harness & KPI Trend Loop (LC-20).

Provides:
- Automated benchmark suite: intent classification, response latency,
  memory throughput, and system resource snapshots
- KPI collector: records metrics after every command
- Trend persistence: weekly JSON snapshots stored on disk
- Regression detector: flags any KPI that drops > threshold between runs
- Report generator: produces a markdown summary of current vs. historical KPIs

Storage:
  jarvis/data/benchmarks/
    kpi_current.json       ← rolling window of recent metrics
    kpi_history/
      kpi_YYYY-MM-DD.json  ← daily KPI snapshots
    reports/
      benchmark_YYYY-MM-DD.md ← generated reports
"""
from __future__ import annotations

import datetime
import json
import os
import statistics
import time
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

# ── Storage ──────────────────────────────────────────────────────────────────
_BENCH_DIR = Path(__file__).resolve().parents[1] / "data" / "benchmarks"
_BENCH_DIR.mkdir(parents=True, exist_ok=True)
_KPI_CURRENT = _BENCH_DIR / "kpi_current.json"
_KPI_HISTORY = _BENCH_DIR / "kpi_history"
_KPI_HISTORY.mkdir(parents=True, exist_ok=True)
_REPORT_DIR = _BENCH_DIR / "reports"
_REPORT_DIR.mkdir(parents=True, exist_ok=True)

# How many data points to keep in the rolling window
_ROLLING_WINDOW = 500

# Regression threshold: if a KPI degrades by more than this %, flag it
_REGRESSION_THRESHOLD_PCT = 15.0


# ── Standard intent benchmark corpus ─────────────────────────────────────────
# (input_text, expected_intent) pairs used to measure intent classification accuracy
INTENT_BENCHMARK: list[tuple[str, str]] = [
    ("what's the weather today", "weather"),
    ("open chrome", "open_app"),
    ("close notepad", "close_app"),
    ("search for python tutorials", "search_web"),
    ("what time is it", "datetime"),
    ("take a screenshot", "screenshot"),
    ("increase volume", "volume_up"),
    ("mute", "volume_mute"),
    ("teach me reconnaissance", "hacking_teach_module"),
    ("quiz me", "hacking_quiz"),
    ("show me the course", "hacking_list_modules"),
    ("what do you know about XSS", "hacking_explain"),
    ("my progress", "hacking_progress"),
    ("hack http://example.com", "visual_ghost_mode"),
    ("stealth attack http://target.com", "stealth_attack_execute"),
    ("stealth status", "stealth_engine_status"),
    ("go paranoid", "stealth_set_profile"),
    ("attack http://mysite.com", "attack_execute"),
    ("give me an attack plan", "expert_attack_plan"),
    ("decision tree for domain admin", "expert_decision_tree"),
    ("im stuck nothing works", "expert_unstuck"),
    ("expert tip", "expert_tip"),
    ("teach me rootkits", "stealth_teach_module"),
    ("explain golden ticket", "stealth_explain"),
    ("open youtube and watch data structures", "youtube_watch_learn"),
    ("learn from https://example.com", "learn"),
    ("write code to scan a network", "code_gen"),
    ("run ipconfig", "run_shell"),
    ("what do you know about navmesh", "memory_query"),
    ("how much do you know", "memory_stats"),
    ("open unreal engine", "unreal_open"),
    ("create a new project named Test", "unreal_new_project"),
    ("place a cube", "unreal_place_cube"),
]


# ── Data structures ──────────────────────────────────────────────────────────
@dataclass
class KPISnapshot:
    """A single timestamped KPI recording."""
    timestamp: str = ""
    session_id: str = ""
    # Latency
    response_latency_ms: float = 0.0
    # Intent accuracy (from benchmark runs)
    intent_accuracy_pct: float = 0.0
    intent_correct: int = 0
    intent_total: int = 0
    # Memory
    memory_chunk_count: int = 0
    # System resources
    ram_used_mb: float = 0.0
    ram_percent: float = 0.0
    cpu_percent: float = 0.0
    # Session
    commands_this_session: int = 0
    uptime_seconds: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "KPISnapshot":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class CommandMetric:
    """Metric recorded for a single command execution."""
    timestamp: str = ""
    intent: str = ""
    latency_ms: float = 0.0
    success: bool = True
    input_length: int = 0
    output_length: int = 0


# ── KPI Collector ────────────────────────────────────────────────────────────
class KPICollector:
    """
    Collects per-command metrics, runs benchmark suites, detects regressions,
    and generates trend reports.

    Usage::

        kpi = KPICollector(session_id="abc")
        kpi.record_command(intent="weather", latency_ms=142.3, success=True, ...)
        snapshot = kpi.take_snapshot(memory_count=1200)
        regressions = kpi.detect_regressions()
        kpi.generate_report()
    """

    def __init__(self, session_id: str = "") -> None:
        self._session_id = session_id
        self._metrics: list[CommandMetric] = []
        self._start_time = time.monotonic()
        self._command_count = 0
        self._load_current()

    @property
    def command_count(self) -> int:
        return self._command_count

    # ── Per-command recording ─────────────────────────────────────────────

    def record_command(
        self,
        *,
        intent: str,
        latency_ms: float,
        success: bool = True,
        input_length: int = 0,
        output_length: int = 0,
    ) -> None:
        """Record a single command execution metric."""
        self._command_count += 1
        metric = CommandMetric(
            timestamp=datetime.datetime.now().isoformat(),
            intent=intent,
            latency_ms=latency_ms,
            success=success,
            input_length=input_length,
            output_length=output_length,
        )
        self._metrics.append(metric)

        # Prune rolling window
        if len(self._metrics) > _ROLLING_WINDOW:
            self._metrics = self._metrics[-_ROLLING_WINDOW:]

    # ── Intent benchmark ──────────────────────────────────────────────────

    def run_intent_benchmark(self, intent_fn) -> tuple[int, int, list[str]]:
        """
        Run the standard intent benchmark corpus against a Brain._intent function.
        Returns (correct, total, list_of_mismatches).
        """
        correct = 0
        total = len(INTENT_BENCHMARK)
        mismatches: list[str] = []

        for input_text, expected in INTENT_BENCHMARK:
            try:
                actual = intent_fn(input_text)
                if actual == expected:
                    correct += 1
                else:
                    mismatches.append(
                        f"  '{input_text}' → got '{actual}', expected '{expected}'"
                    )
            except Exception as exc:
                mismatches.append(f"  '{input_text}' → ERROR: {exc}")

        return correct, total, mismatches

    # ── Snapshot ──────────────────────────────────────────────────────────

    def take_snapshot(
        self,
        *,
        memory_count: int = 0,
        intent_fn=None,
    ) -> KPISnapshot:
        """
        Capture a full KPI snapshot: latency stats, intent accuracy, resources.
        Saves to disk automatically.
        """
        # Latency stats
        latencies = [m.latency_ms for m in self._metrics if m.latency_ms > 0]
        avg_latency = statistics.mean(latencies) if latencies else 0.0

        # Intent benchmark
        correct, total, _ = (0, 0, [])
        if intent_fn:
            correct, total, _ = self.run_intent_benchmark(intent_fn)

        accuracy = (correct / total * 100) if total > 0 else 0.0

        # System resources
        ram_mb, ram_pct, cpu_pct = self._get_system_resources()

        snap = KPISnapshot(
            timestamp=datetime.datetime.now().isoformat(),
            session_id=self._session_id,
            response_latency_ms=round(avg_latency, 1),
            intent_accuracy_pct=round(accuracy, 1),
            intent_correct=correct,
            intent_total=total,
            memory_chunk_count=memory_count,
            ram_used_mb=round(ram_mb, 1),
            ram_percent=round(ram_pct, 1),
            cpu_percent=round(cpu_pct, 1),
            commands_this_session=self._command_count,
            uptime_seconds=round(time.monotonic() - self._start_time, 1),
        )

        self._save_snapshot(snap)
        return snap

    # ── Regression detection ─────────────────────────────────────────────

    def detect_regressions(self) -> list[str]:
        """
        Compare the latest snapshot against the previous day's snapshot.
        Returns a list of regression warning strings (empty = all good).
        """
        history = self._load_history(n=2)
        if len(history) < 2:
            return []  # Not enough data yet

        latest = history[-1]
        previous = history[-2]

        warnings: list[str] = []

        # Latency regression (higher = worse)
        if previous.response_latency_ms > 0 and latest.response_latency_ms > 0:
            delta_pct = (
                (latest.response_latency_ms - previous.response_latency_ms)
                / previous.response_latency_ms
                * 100
            )
            if delta_pct > _REGRESSION_THRESHOLD_PCT:
                warnings.append(
                    f"⚠ Latency regression: {previous.response_latency_ms:.0f}ms → "
                    f"{latest.response_latency_ms:.0f}ms (+{delta_pct:.1f}%)"
                )

        # Intent accuracy regression (lower = worse)
        if previous.intent_accuracy_pct > 0 and latest.intent_accuracy_pct > 0:
            delta = previous.intent_accuracy_pct - latest.intent_accuracy_pct
            if delta > _REGRESSION_THRESHOLD_PCT:
                warnings.append(
                    f"⚠ Intent accuracy regression: {previous.intent_accuracy_pct:.1f}% → "
                    f"{latest.intent_accuracy_pct:.1f}% (−{delta:.1f}%)"
                )

        # RAM regression (higher = worse)
        if previous.ram_used_mb > 0 and latest.ram_used_mb > 0:
            ram_delta_pct = (
                (latest.ram_used_mb - previous.ram_used_mb)
                / previous.ram_used_mb
                * 100
            )
            if ram_delta_pct > 25:  # 25% RAM increase is concerning
                warnings.append(
                    f"⚠ RAM usage spike: {previous.ram_used_mb:.0f}MB → "
                    f"{latest.ram_used_mb:.0f}MB (+{ram_delta_pct:.1f}%)"
                )

        return warnings

    # ── Report generation ────────────────────────────────────────────────

    def generate_report(self, *, intent_fn=None, memory_count: int = 0) -> str:
        """
        Generate a full benchmark report as markdown.
        Also saves to disk.
        """
        snap = self.take_snapshot(memory_count=memory_count, intent_fn=intent_fn)
        regressions = self.detect_regressions()
        history = self._load_history(n=7)

        lines: list[str] = []
        lines.append(f"# JARVIS Benchmark Report — {snap.timestamp[:10]}")
        lines.append("")
        lines.append("## Current KPIs")
        lines.append("")
        lines.append(f"| KPI | Value |")
        lines.append(f"|-----|-------|")
        lines.append(f"| Avg Response Latency | {snap.response_latency_ms:.1f} ms |")
        lines.append(f"| Intent Accuracy | {snap.intent_accuracy_pct:.1f}% ({snap.intent_correct}/{snap.intent_total}) |")
        lines.append(f"| Memory Chunks | {snap.memory_chunk_count} |")
        lines.append(f"| RAM Usage | {snap.ram_used_mb:.0f} MB ({snap.ram_percent:.1f}%) |")
        lines.append(f"| CPU Usage | {snap.cpu_percent:.1f}% |")
        lines.append(f"| Session Commands | {snap.commands_this_session} |")
        lines.append(f"| Uptime | {snap.uptime_seconds:.0f}s |")
        lines.append("")

        if regressions:
            lines.append("## ⚠ Regressions Detected")
            lines.append("")
            for w in regressions:
                lines.append(f"- {w}")
            lines.append("")
        else:
            lines.append("## ✅ No Regressions Detected")
            lines.append("")

        if len(history) > 1:
            lines.append("## 7-Day Trend")
            lines.append("")
            lines.append("| Date | Latency (ms) | Intent Acc (%) | RAM (MB) | Commands |")
            lines.append("|------|-------------|----------------|----------|----------|")
            for h in history:
                d = h.timestamp[:10] if h.timestamp else "?"
                lines.append(
                    f"| {d} | {h.response_latency_ms:.1f} | "
                    f"{h.intent_accuracy_pct:.1f} | "
                    f"{h.ram_used_mb:.0f} | "
                    f"{h.commands_this_session} |"
                )
            lines.append("")

        # Intent benchmark detail (run if intent_fn provided)
        if intent_fn:
            correct, total, mismatches = self.run_intent_benchmark(intent_fn)
            lines.append(f"## Intent Classification Detail — {correct}/{total}")
            lines.append("")
            if mismatches:
                lines.append("**Mismatches:**")
                for m in mismatches:
                    lines.append(f"- {m}")
            else:
                lines.append("All intents classified correctly. ✅")
            lines.append("")

        # Command distribution
        if self._metrics:
            intent_counts: dict[str, int] = defaultdict(int)
            for m in self._metrics:
                intent_counts[m.intent] += 1
            sorted_intents = sorted(intent_counts.items(), key=lambda x: -x[1])
            lines.append("## Command Distribution (this session)")
            lines.append("")
            lines.append("| Intent | Count |")
            lines.append("|--------|-------|")
            for intent, cnt in sorted_intents[:15]:
                lines.append(f"| {intent} | {cnt} |")
            lines.append("")

        report_text = "\n".join(lines)

        # Save report to disk
        today = datetime.date.today().isoformat()
        report_file = _REPORT_DIR / f"benchmark_{today}.md"
        try:
            report_file.write_text(report_text, encoding="utf-8")
        except Exception:
            pass

        return report_text

    # ── Display (Rich terminal) ──────────────────────────────────────────

    def print_summary(self, *, intent_fn=None, memory_count: int = 0) -> str:
        """Print a quick KPI summary to terminal and return spoken text."""
        snap = self.take_snapshot(memory_count=memory_count, intent_fn=intent_fn)
        regressions = self.detect_regressions()

        table = Table(title="JARVIS KPI Dashboard", border_style="cyan")
        table.add_column("KPI", style="bright_blue")
        table.add_column("Value", style="bright_green")
        table.add_row("Avg Latency", f"{snap.response_latency_ms:.1f} ms")
        table.add_row("Intent Accuracy", f"{snap.intent_accuracy_pct:.1f}%")
        table.add_row("Memory Chunks", str(snap.memory_chunk_count))
        table.add_row("RAM", f"{snap.ram_used_mb:.0f} MB ({snap.ram_percent:.1f}%)")
        table.add_row("CPU", f"{snap.cpu_percent:.1f}%")
        table.add_row("Commands", str(snap.commands_this_session))

        console.print(table)

        if regressions:
            for w in regressions:
                console.print(f"  [bold red]{w}[/]")

        spoken = (
            f"Performance report: average latency {snap.response_latency_ms:.0f} milliseconds, "
            f"intent accuracy {snap.intent_accuracy_pct:.0f} percent, "
            f"{snap.memory_chunk_count} memory chunks, "
            f"RAM at {snap.ram_percent:.0f} percent."
        )
        if regressions:
            spoken += f" Warning: {len(regressions)} regression{'s' if len(regressions) > 1 else ''} detected."
        else:
            spoken += " No regressions detected."

        return spoken

    # ── Persistence ──────────────────────────────────────────────────────

    def _save_snapshot(self, snap: KPISnapshot) -> None:
        """Save snapshot to current file and daily history."""
        data = snap.to_dict()
        try:
            # Current file (rolling)
            current_data: list[dict] = []
            if _KPI_CURRENT.exists():
                try:
                    current_data = json.loads(_KPI_CURRENT.read_text(encoding="utf-8"))
                except Exception:
                    current_data = []
            current_data.append(data)
            if len(current_data) > _ROLLING_WINDOW:
                current_data = current_data[-_ROLLING_WINDOW:]
            tmp = _KPI_CURRENT.with_suffix(".tmp")
            tmp.write_text(json.dumps(current_data, indent=2), encoding="utf-8")
            tmp.replace(_KPI_CURRENT)

            # Daily file
            today = datetime.date.today().isoformat()
            daily_file = _KPI_HISTORY / f"kpi_{today}.json"
            daily_data: list[dict] = []
            if daily_file.exists():
                try:
                    daily_data = json.loads(daily_file.read_text(encoding="utf-8"))
                except Exception:
                    daily_data = []
            daily_data.append(data)
            daily_file.write_text(json.dumps(daily_data, indent=2), encoding="utf-8")
        except Exception as exc:
            console.print(f"  [yellow]KPI save error: {exc}[/]")

    def _load_current(self) -> None:
        """Load rolling metrics from disk on startup."""
        if not _KPI_CURRENT.exists():
            return
        try:
            data = json.loads(_KPI_CURRENT.read_text(encoding="utf-8"))
            # We don't restore individual CommandMetric objects,
            # just acknowledge the data exists for trend purposes.
        except Exception:
            pass

    def _load_history(self, n: int = 7) -> list[KPISnapshot]:
        """Load the last n daily snapshots (latest entry per day)."""
        files = sorted(_KPI_HISTORY.glob("kpi_*.json"))[-n:]
        snapshots: list[KPISnapshot] = []
        for f in files:
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                if data:
                    # Take the last snapshot from each day
                    snapshots.append(KPISnapshot.from_dict(data[-1]))
            except Exception:
                continue
        return snapshots

    # ── System resources ─────────────────────────────────────────────────

    @staticmethod
    def _get_system_resources() -> tuple[float, float, float]:
        """Return (ram_used_mb, ram_percent, cpu_percent)."""
        try:
            import psutil
            vm = psutil.virtual_memory()
            cpu = psutil.cpu_percent(interval=0.1)
            return vm.used / (1024 ** 2), vm.percent, cpu
        except ImportError:
            return 0.0, 0.0, 0.0

    # ── Stats summary ────────────────────────────────────────────────────

    def get_stats(self) -> Dict[str, Any]:
        """Quick stat dict for status displays."""
        latencies = [m.latency_ms for m in self._metrics if m.latency_ms > 0]
        return {
            "metrics_recorded": len(self._metrics),
            "commands_this_session": self._command_count,
            "avg_latency_ms": round(statistics.mean(latencies), 1) if latencies else 0,
            "p95_latency_ms": round(
                sorted(latencies)[int(len(latencies) * 0.95)] if len(latencies) > 5 else 0, 1
            ),
            "success_rate_pct": round(
                sum(1 for m in self._metrics if m.success) / len(self._metrics) * 100
                if self._metrics else 100, 1
            ),
            "history_days": len(list(_KPI_HISTORY.glob("kpi_*.json"))),
        }
