"""
JARVIS — Soak Stability Monitor (LC-21).

Provides:
- Long-running stability monitoring (1h / 4h / 8h soak cycles)
- Continuous resource sampling (RAM, CPU, disk, thread count)
- Anomaly detection: memory leaks, CPU spikes, thread exhaustion
- Health scoring: HEALTHY / DEGRADED / CRITICAL with auto-recovery hints
- Soak test reporting: pass/fail with detailed time-series data

This module runs as a background daemon thread alongside JARVIS,
periodically sampling system health and flagging anomalies.

Storage:
  jarvis/data/soak/
    soak_YYYY-MM-DD.jsonl  ← time-series health samples
    soak_report_latest.md  ← most recent soak report
"""
from __future__ import annotations

import datetime
import json
import os
import statistics
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

# ── Storage ──────────────────────────────────────────────────────────────────
_SOAK_DIR = Path(__file__).resolve().parents[1] / "data" / "soak"
_SOAK_DIR.mkdir(parents=True, exist_ok=True)

# Sampling interval in seconds
_SAMPLE_INTERVAL = 30

# Thresholds
_RAM_WARN_MB = 1500       # JARVIS process > 1.5 GB
_RAM_CRIT_MB = 2500       # JARVIS process > 2.5 GB
_CPU_WARN_PCT = 80        # sustained CPU > 80%
_CPU_CRIT_PCT = 95        # sustained CPU > 95%
_THREAD_WARN = 100        # thread count > 100
_THREAD_CRIT = 200        # thread count > 200
_DISK_WARN_PCT = 90       # disk > 90% full
_RAM_LEAK_RATE_MB_H = 50  # memory growing > 50 MB/hour = leak


# ── Data structures ──────────────────────────────────────────────────────────
@dataclass
class HealthSample:
    """A single health snapshot."""
    timestamp: str = ""
    uptime_seconds: float = 0.0
    # Process-level
    proc_ram_mb: float = 0.0
    proc_threads: int = 0
    proc_cpu_pct: float = 0.0
    # System-level
    sys_ram_pct: float = 0.0
    sys_ram_avail_mb: float = 0.0
    sys_cpu_pct: float = 0.0
    sys_disk_pct: float = 0.0
    # Derived
    health_score: str = "HEALTHY"  # HEALTHY / DEGRADED / CRITICAL
    anomalies: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "HealthSample":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class SoakReport:
    """Summary of a soak stability run."""
    start_time: str = ""
    end_time: str = ""
    duration_seconds: float = 0.0
    total_samples: int = 0
    healthy_samples: int = 0
    degraded_samples: int = 0
    critical_samples: int = 0
    peak_ram_mb: float = 0.0
    avg_ram_mb: float = 0.0
    peak_cpu_pct: float = 0.0
    avg_cpu_pct: float = 0.0
    peak_threads: int = 0
    memory_leak_detected: bool = False
    ram_growth_mb_per_hour: float = 0.0
    all_anomalies: List[str] = field(default_factory=list)
    verdict: str = "PASS"  # PASS / FAIL

    def to_markdown(self) -> str:
        duration_h = self.duration_seconds / 3600
        lines = [
            f"# JARVIS Soak Stability Report",
            f"",
            f"**Duration:** {duration_h:.1f} hours ({self.duration_seconds:.0f}s)",
            f"**Period:** {self.start_time} → {self.end_time}",
            f"**Verdict:** {'✅ PASS' if self.verdict == 'PASS' else '❌ FAIL'}",
            f"",
            f"## Health Distribution",
            f"",
            f"| Status | Samples | Percentage |",
            f"|--------|---------|------------|",
        ]
        total = max(self.total_samples, 1)
        lines.append(f"| ✅ HEALTHY | {self.healthy_samples} | {self.healthy_samples/total*100:.1f}% |")
        lines.append(f"| ⚠ DEGRADED | {self.degraded_samples} | {self.degraded_samples/total*100:.1f}% |")
        lines.append(f"| 🔴 CRITICAL | {self.critical_samples} | {self.critical_samples/total*100:.1f}% |")
        lines.append(f"")
        lines.append(f"## Resource Summary")
        lines.append(f"")
        lines.append(f"| Metric | Peak | Average |")
        lines.append(f"|--------|------|---------|")
        lines.append(f"| Process RAM | {self.peak_ram_mb:.0f} MB | {self.avg_ram_mb:.0f} MB |")
        lines.append(f"| CPU | {self.peak_cpu_pct:.1f}% | {self.avg_cpu_pct:.1f}% |")
        lines.append(f"| Threads | {self.peak_threads} | — |")
        lines.append(f"| RAM Growth Rate | {self.ram_growth_mb_per_hour:.1f} MB/hour | — |")
        lines.append(f"")

        if self.memory_leak_detected:
            lines.append(f"## ⚠ Memory Leak Detected")
            lines.append(f"")
            lines.append(f"RAM is growing at **{self.ram_growth_mb_per_hour:.1f} MB/hour**.")
            lines.append(f"Threshold: {_RAM_LEAK_RATE_MB_H} MB/hour.")
            lines.append(f"")

        if self.all_anomalies:
            lines.append(f"## Anomalies ({len(self.all_anomalies)} total)")
            lines.append(f"")
            # Deduplicate and count
            from collections import Counter
            counts = Counter(self.all_anomalies)
            for anomaly, count in counts.most_common(20):
                lines.append(f"- {anomaly} (×{count})")
            lines.append(f"")

        lines.append(f"---")
        lines.append(f"*Generated at {datetime.datetime.now().isoformat()}*")
        return "\n".join(lines)


# ── Soak Monitor ─────────────────────────────────────────────────────────────
class SoakMonitor:
    """
    Background daemon that continuously monitors JARVIS stability.

    Usage::

        monitor = SoakMonitor(session_id="abc")
        monitor.start()
        ...
        report = monitor.get_report()
        monitor.stop()
    """

    def __init__(
        self,
        session_id: str = "",
        sample_interval: float = _SAMPLE_INTERVAL,
    ) -> None:
        self._session_id = session_id
        self._interval = sample_interval
        self._samples: list[HealthSample] = []
        self._start_time = time.monotonic()
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._started = False
        self._today = datetime.date.today().isoformat()
        self._log_path = _SOAK_DIR / f"soak_{self._today}.jsonl"

    @property
    def is_running(self) -> bool:
        return self._started

    @property
    def sample_count(self) -> int:
        return len(self._samples)

    # ── Lifecycle ─────────────────────────────────────────────────────────

    def start(self) -> None:
        """Start the background soak monitoring thread."""
        if self._started:
            return
        self._started = True
        self._start_time = time.monotonic()
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._sample_loop, daemon=True, name="jarvis-soak-monitor"
        )
        self._thread.start()
        console.print(
            f"  [dim green]Soak monitor armed — sampling every "
            f"{int(self._interval)}s.[/]"
        )

    def stop(self) -> Optional[SoakReport]:
        """Stop monitoring and return the final soak report."""
        if not self._started:
            return None
        self._started = False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        report = self.get_report()
        self._save_report(report)
        return report

    # ── Sampling loop ─────────────────────────────────────────────────────

    def _sample_loop(self) -> None:
        """Background loop: sample → analyze → store."""
        while not self._stop_event.is_set():
            try:
                sample = self._take_sample()
                with self._lock:
                    self._samples.append(sample)
                self._persist_sample(sample)
            except Exception as exc:
                console.print(f"  [yellow]Soak sample error: {exc}[/]")
            self._stop_event.wait(timeout=self._interval)

    def _take_sample(self) -> HealthSample:
        """Capture a single health sample."""
        now_iso = datetime.datetime.now().isoformat()
        uptime = time.monotonic() - self._start_time

        proc_ram, proc_threads, proc_cpu = self._get_process_resources()
        sys_ram_pct, sys_ram_avail, sys_cpu, sys_disk = self._get_system_resources()

        anomalies: list[str] = []
        health = "HEALTHY"

        # RAM checks
        if proc_ram > _RAM_CRIT_MB:
            anomalies.append(f"CRITICAL: Process RAM {proc_ram:.0f}MB > {_RAM_CRIT_MB}MB")
            health = "CRITICAL"
        elif proc_ram > _RAM_WARN_MB:
            anomalies.append(f"WARNING: Process RAM {proc_ram:.0f}MB > {_RAM_WARN_MB}MB")
            if health == "HEALTHY":
                health = "DEGRADED"

        # CPU checks
        if proc_cpu > _CPU_CRIT_PCT:
            anomalies.append(f"CRITICAL: Process CPU {proc_cpu:.1f}% > {_CPU_CRIT_PCT}%")
            health = "CRITICAL"
        elif proc_cpu > _CPU_WARN_PCT:
            anomalies.append(f"WARNING: Process CPU {proc_cpu:.1f}% > {_CPU_WARN_PCT}%")
            if health == "HEALTHY":
                health = "DEGRADED"

        # Thread checks
        if proc_threads > _THREAD_CRIT:
            anomalies.append(f"CRITICAL: Thread count {proc_threads} > {_THREAD_CRIT}")
            health = "CRITICAL"
        elif proc_threads > _THREAD_WARN:
            anomalies.append(f"WARNING: Thread count {proc_threads} > {_THREAD_WARN}")
            if health == "HEALTHY":
                health = "DEGRADED"

        # Disk check
        if sys_disk > _DISK_WARN_PCT:
            anomalies.append(f"WARNING: Disk {sys_disk:.1f}% > {_DISK_WARN_PCT}%")
            if health == "HEALTHY":
                health = "DEGRADED"

        # Memory leak detection (need at least 10 samples)
        if len(self._samples) >= 10:
            early_ram = statistics.mean(
                s.proc_ram_mb for s in self._samples[:5]
            )
            late_ram = statistics.mean(
                s.proc_ram_mb for s in self._samples[-5:]
            )
            time_span_h = max(uptime / 3600, 0.01)
            growth_rate = (late_ram - early_ram) / time_span_h
            if growth_rate > _RAM_LEAK_RATE_MB_H:
                anomalies.append(
                    f"LEAK: RAM growing at {growth_rate:.1f} MB/hour "
                    f"(threshold: {_RAM_LEAK_RATE_MB_H})"
                )
                if health == "HEALTHY":
                    health = "DEGRADED"

        return HealthSample(
            timestamp=now_iso,
            uptime_seconds=round(uptime, 1),
            proc_ram_mb=round(proc_ram, 1),
            proc_threads=proc_threads,
            proc_cpu_pct=round(proc_cpu, 1),
            sys_ram_pct=round(sys_ram_pct, 1),
            sys_ram_avail_mb=round(sys_ram_avail, 1),
            sys_cpu_pct=round(sys_cpu, 1),
            sys_disk_pct=round(sys_disk, 1),
            health_score=health,
            anomalies=anomalies,
        )

    # ── Report generation ────────────────────────────────────────────────

    def get_report(self) -> SoakReport:
        """Generate a soak stability report from collected samples."""
        with self._lock:
            samples = list(self._samples)

        if not samples:
            return SoakReport(verdict="PASS")

        ram_values = [s.proc_ram_mb for s in samples]
        cpu_values = [s.proc_cpu_pct for s in samples]
        thread_values = [s.proc_threads for s in samples]

        healthy = sum(1 for s in samples if s.health_score == "HEALTHY")
        degraded = sum(1 for s in samples if s.health_score == "DEGRADED")
        critical = sum(1 for s in samples if s.health_score == "CRITICAL")

        all_anomalies: list[str] = []
        for s in samples:
            all_anomalies.extend(s.anomalies)

        # Memory leak calculation
        time_span_h = max(
            (time.monotonic() - self._start_time) / 3600, 0.01
        )
        ram_growth_rate = 0.0
        leak_detected = False
        if len(samples) >= 10:
            early = statistics.mean(s.proc_ram_mb for s in samples[:5])
            late = statistics.mean(s.proc_ram_mb for s in samples[-5:])
            ram_growth_rate = (late - early) / time_span_h
            leak_detected = ram_growth_rate > _RAM_LEAK_RATE_MB_H

        # Verdict: FAIL if any CRITICAL or >10% DEGRADED or leak
        total = len(samples)
        verdict = "PASS"
        if critical > 0:
            verdict = "FAIL"
        elif degraded / total > 0.10:
            verdict = "FAIL"
        elif leak_detected:
            verdict = "FAIL"

        return SoakReport(
            start_time=samples[0].timestamp,
            end_time=samples[-1].timestamp,
            duration_seconds=round(time.monotonic() - self._start_time, 1),
            total_samples=total,
            healthy_samples=healthy,
            degraded_samples=degraded,
            critical_samples=critical,
            peak_ram_mb=max(ram_values),
            avg_ram_mb=statistics.mean(ram_values),
            peak_cpu_pct=max(cpu_values),
            avg_cpu_pct=statistics.mean(cpu_values),
            peak_threads=max(thread_values),
            memory_leak_detected=leak_detected,
            ram_growth_mb_per_hour=round(ram_growth_rate, 1),
            all_anomalies=all_anomalies,
            verdict=verdict,
        )

    def get_current_health(self) -> str:
        """Return the most recent health score."""
        with self._lock:
            if self._samples:
                return self._samples[-1].health_score
        return "UNKNOWN"

    def print_status(self) -> str:
        """Print current soak status to terminal, return spoken summary."""
        with self._lock:
            samples = list(self._samples)

        if not samples:
            msg = "Soak monitor has no data yet."
            console.print(f"  [dim]{msg}[/]")
            return msg

        latest = samples[-1]
        uptime_h = latest.uptime_seconds / 3600

        table = Table(title="Soak Stability Status", border_style="cyan")
        table.add_column("Metric", style="bright_blue")
        table.add_column("Value", style="bright_green")
        table.add_row("Uptime", f"{uptime_h:.1f} hours")
        table.add_row("Samples", str(len(samples)))
        table.add_row("Health", latest.health_score)
        table.add_row("Process RAM", f"{latest.proc_ram_mb:.0f} MB")
        table.add_row("Process CPU", f"{latest.proc_cpu_pct:.1f}%")
        table.add_row("Threads", str(latest.proc_threads))
        table.add_row("System RAM", f"{latest.sys_ram_pct:.1f}%")
        table.add_row("Disk", f"{latest.sys_disk_pct:.1f}%")

        healthy_count = sum(1 for s in samples if s.health_score == "HEALTHY")
        health_pct = healthy_count / len(samples) * 100

        table.add_row("Health Rate", f"{health_pct:.1f}% healthy")

        console.print(table)

        if latest.anomalies:
            for a in latest.anomalies:
                console.print(f"  [bold red]{a}[/]")

        spoken = (
            f"Soak status after {uptime_h:.1f} hours: "
            f"{len(samples)} samples collected, "
            f"{health_pct:.0f} percent healthy. "
            f"Process using {latest.proc_ram_mb:.0f} megabytes RAM, "
            f"{latest.proc_cpu_pct:.0f} percent CPU."
        )
        if latest.anomalies:
            spoken += f" {len(latest.anomalies)} anomaly detected."

        return spoken

    # ── Persistence ──────────────────────────────────────────────────────

    def _persist_sample(self, sample: HealthSample) -> None:
        """Append sample to daily log file."""
        # Rotate if day changed
        today = datetime.date.today().isoformat()
        if today != self._today:
            self._today = today
            self._log_path = _SOAK_DIR / f"soak_{today}.jsonl"

        try:
            with open(self._log_path, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(sample.to_dict(), default=str) + "\n")
        except Exception:
            pass

    def _save_report(self, report: SoakReport) -> None:
        """Save a markdown soak report to disk."""
        try:
            report_path = _SOAK_DIR / "soak_report_latest.md"
            report_path.write_text(report.to_markdown(), encoding="utf-8")

            # Also save dated copy
            today = datetime.date.today().isoformat()
            dated_path = _SOAK_DIR / f"soak_report_{today}.md"
            dated_path.write_text(report.to_markdown(), encoding="utf-8")
        except Exception:
            pass

    # ── Resource sampling ────────────────────────────────────────────────

    @staticmethod
    def _get_process_resources() -> tuple[float, int, float]:
        """Return (ram_mb, thread_count, cpu_pct) for the JARVIS process."""
        try:
            import psutil
            proc = psutil.Process(os.getpid())
            mem = proc.memory_info()
            ram_mb = mem.rss / (1024 ** 2)
            threads = proc.num_threads()
            cpu = proc.cpu_percent(interval=0.1)
            return ram_mb, threads, cpu
        except ImportError:
            # Fallback without psutil
            return 0.0, threading.active_count(), 0.0

    @staticmethod
    def _get_system_resources() -> tuple[float, float, float, float]:
        """Return (ram_pct, ram_avail_mb, cpu_pct, disk_pct)."""
        try:
            import psutil
            vm = psutil.virtual_memory()
            cpu = psutil.cpu_percent(interval=0.1)
            disk = psutil.disk_usage("/")
            return vm.percent, vm.available / (1024 ** 2), cpu, disk.percent
        except ImportError:
            return 0.0, 0.0, 0.0, 0.0
        except Exception:
            return 0.0, 0.0, 0.0, 0.0
