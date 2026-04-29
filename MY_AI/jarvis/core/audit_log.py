"""
JARVIS — Tamper-Evident Audit & Redaction Log (LC-19).

Provides:
- Append-only audit trail for every JARVIS action
- SHA-256 hash-chaining: each entry includes the hash of the previous entry,
  making retroactive modification detectable
- Automatic PII / secret redaction before anything is written to disk
- Daily log rotation with cumulative integrity digest
- ``verify()`` function to validate the full chain at any time

Storage layout:
  jarvis/data/audit/
    audit_YYYY-MM-DD.jsonl   ← one JSON object per line (append-only)
    digest_YYYY-MM-DD.sha256 ← daily integrity digest
    chain_head.json          ← latest hash for chain continuity across files
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import re
import threading
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from rich.console import Console

console = Console()

# ── Storage ──────────────────────────────────────────────────────────────────
_AUDIT_DIR = Path(__file__).resolve().parents[1] / "data" / "audit"
_AUDIT_DIR.mkdir(parents=True, exist_ok=True)
_CHAIN_HEAD = _AUDIT_DIR / "chain_head.json"


# ── Redaction patterns ───────────────────────────────────────────────────────
#    Designed to strip common secrets BEFORE they ever hit the log file.

_REDACTION_RULES: list[tuple[re.Pattern, str]] = [
    # API keys / tokens  (common formats)
    (re.compile(
        r"""(?:api[_-]?key|apikey|token|secret|bearer|authorization"""
        r"""|password|passwd|pwd|access[_-]?key|private[_-]?key)"""
        r"""[\s:="']+([A-Za-z0-9\-_./+]{16,})""",
        re.IGNORECASE,
    ), r"\g<0>".replace(r"\1", "[REDACTED]")),

    # Generic long hex/base64 secrets (>= 32 chars following key-like words)
    (re.compile(
        r"""(?<=(?:key|token|secret|password|auth)[=:\s"']{1,3})"""
        r"""[A-Za-z0-9+/\-_]{32,}""",
        re.IGNORECASE,
    ), "[REDACTED]"),

    # Email addresses
    (re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"), "[EMAIL_REDACTED]"),

    # Phone numbers (common formats)
    (re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[PHONE_REDACTED]"),

    # Credit card numbers (very rough 16-digit match)
    (re.compile(r"\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b"), "[CC_REDACTED]"),

    # AWS-style keys
    (re.compile(r"AKIA[0-9A-Z]{16}"), "[AWS_KEY_REDACTED]"),

    # SSH private key blocks
    (re.compile(
        r"-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----"
        r"[\s\S]*?"
        r"-----END\s+(?:RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----",
        re.IGNORECASE,
    ), "[PRIVATE_KEY_REDACTED]"),

    # Windows file paths outside the project (user-specific paths)
    (re.compile(
        r"C:\\Users\\[A-Za-z0-9._-]+\\(?:Desktop|Documents|Downloads|AppData)"
        r"(?:\\[^\s\"']+)?",
        re.IGNORECASE,
    ), "[PATH_REDACTED]"),
]


def redact(text: str) -> str:
    """Scrub sensitive data from *text* and return the cleaned version."""
    if not text:
        return text
    result = text
    for pattern, replacement in _REDACTION_RULES:
        result = pattern.sub(replacement, result)
    return result


def redact_dict(data: dict) -> dict:
    """Recursively redact all string values in a dictionary."""
    out = {}
    for k, v in data.items():
        if isinstance(v, str):
            out[k] = redact(v)
        elif isinstance(v, dict):
            out[k] = redact_dict(v)
        elif isinstance(v, list):
            out[k] = [
                redact(i) if isinstance(i, str)
                else redact_dict(i) if isinstance(i, dict)
                else i
                for i in v
            ]
        else:
            out[k] = v
    return out


# ── Audit entry ──────────────────────────────────────────────────────────────
@dataclass
class AuditEntry:
    """Single record in the tamper-evident log."""

    entry_id: str = ""
    timestamp: str = ""
    session_id: str = ""
    event_type: str = ""          # e.g. command, response, tool_call, error, boot, shutdown
    actor: str = "jarvis"         # jarvis | user | system
    intent: str = ""
    input_text: str = ""
    output_text: str = ""
    risk_level: str = "L0"        # L0-L5
    success: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)
    prev_hash: str = ""           # SHA-256 of previous entry (chain link)
    entry_hash: str = ""          # SHA-256 of this entry (computed)

    def compute_hash(self) -> str:
        """Deterministic hash of all fields except entry_hash itself."""
        payload = {k: v for k, v in asdict(self).items() if k != "entry_hash"}
        raw = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def to_json_line(self) -> str:
        return json.dumps(asdict(self), default=str)

    @classmethod
    def from_json_line(cls, line: str) -> "AuditEntry":
        data = json.loads(line)
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


# ── Chain head persistence ───────────────────────────────────────────────────
def _read_chain_head() -> str:
    """Return the hash of the last entry written (or genesis hash)."""
    if _CHAIN_HEAD.exists():
        try:
            data = json.loads(_CHAIN_HEAD.read_text(encoding="utf-8"))
            return data.get("hash", "GENESIS")
        except Exception:
            pass
    return "GENESIS"


def _write_chain_head(h: str) -> None:
    payload = json.dumps({"hash": h, "updated": datetime.datetime.now().isoformat()})
    tmp = _CHAIN_HEAD.with_suffix(".tmp")
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(_CHAIN_HEAD)


# ── Audit Logger ─────────────────────────────────────────────────────────────
class AuditLogger:
    """
    Append-only, hash-chained, redacted audit log.

    Usage::

        logger = AuditLogger(session_id="abc123")
        logger.log_command(user_input="teach me XSS", intent="hacking_teach_module")
        logger.log_response(output="Here is the XSS module...")
        logger.log_tool_call(tool="AttackEngine", target="http://example.com")

    Verification::

        ok, errors = logger.verify()  # checks entire chain

    """

    def __init__(self, session_id: str = "") -> None:
        self._session_id = session_id or uuid.uuid4().hex[:12]
        self._lock = threading.Lock()
        self._prev_hash = _read_chain_head()
        self._entry_count = 0
        self._today = datetime.date.today().isoformat()
        self._log_path = _AUDIT_DIR / f"audit_{self._today}.jsonl"

    @property
    def session_id(self) -> str:
        return self._session_id

    @property
    def log_path(self) -> Path:
        return self._log_path

    @property
    def entry_count(self) -> int:
        return self._entry_count

    # ── High-level logging helpers ────────────────────────────────────────

    def log_boot(self, *, model: str = "", memory_count: int = 0) -> None:
        """Record system boot event."""
        self._append(
            event_type="boot",
            actor="system",
            metadata={"model": model, "memory_count": memory_count},
        )

    def log_shutdown(self, *, reason: str = "user_initiated") -> None:
        """Record clean shutdown event."""
        self._append(
            event_type="shutdown",
            actor="system",
            metadata={"reason": reason},
        )

    def log_crash_recovery(self, *, old_session: str = "", restored_msgs: int = 0) -> None:
        """Record a crash recovery event."""
        self._append(
            event_type="crash_recovery",
            actor="system",
            metadata={"old_session": old_session, "restored_messages": restored_msgs},
        )

    def log_command(
        self,
        *,
        user_input: str,
        intent: str = "",
        source: str = "voice",
        risk_level: str = "L0",
    ) -> None:
        """Record a user command (voice or text)."""
        self._append(
            event_type="command",
            actor="user",
            intent=intent,
            input_text=user_input,
            risk_level=risk_level,
            metadata={"source": source},
        )

    def log_response(
        self,
        *,
        output: str,
        intent: str = "",
        success: bool = True,
        latency_ms: float = 0,
    ) -> None:
        """Record a JARVIS response."""
        self._append(
            event_type="response",
            actor="jarvis",
            intent=intent,
            output_text=output,
            success=success,
            metadata={"latency_ms": round(latency_ms, 1)},
        )

    def log_tool_call(
        self,
        *,
        tool: str,
        target: str = "",
        risk_level: str = "L1",
        success: bool = True,
        detail: str = "",
    ) -> None:
        """Record a tool / engine invocation."""
        self._append(
            event_type="tool_call",
            actor="jarvis",
            intent=tool,
            input_text=target,
            output_text=detail,
            risk_level=risk_level,
            success=success,
        )

    def log_security_event(
        self,
        *,
        action: str,
        risk_level: str = "L3",
        approved: bool = True,
        detail: str = "",
    ) -> None:
        """Record a security / approval-gate event."""
        self._append(
            event_type="security",
            actor="system",
            intent=action,
            risk_level=risk_level,
            success=approved,
            output_text=detail,
        )

    def log_error(self, *, error: str, context: str = "") -> None:
        """Record an error event."""
        self._append(
            event_type="error",
            actor="system",
            output_text=error,
            success=False,
            metadata={"context": context},
        )

    # ── Verification ─────────────────────────────────────────────────────

    def verify(self, log_file: Optional[Path] = None) -> tuple[bool, list[str]]:
        """
        Walk the audit log and verify every hash chain link.

        Returns (all_ok, list_of_error_strings).
        """
        target = log_file or self._log_path
        if not target.exists():
            return True, []

        errors: list[str] = []
        prev_hash = None  # we validate relative chain, not absolute genesis
        line_no = 0

        with open(target, "r", encoding="utf-8") as fh:
            for raw_line in fh:
                line_no += 1
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    entry = AuditEntry.from_json_line(raw_line)
                except Exception as exc:
                    errors.append(f"Line {line_no}: malformed JSON — {exc}")
                    continue

                # Verify self-hash
                expected = entry.compute_hash()
                if entry.entry_hash != expected:
                    errors.append(
                        f"Line {line_no} [{entry.entry_id}]: "
                        f"hash mismatch (stored={entry.entry_hash[:16]}… "
                        f"expected={expected[:16]}…)"
                    )

                # Verify chain link
                if prev_hash is not None and entry.prev_hash != prev_hash:
                    errors.append(
                        f"Line {line_no} [{entry.entry_id}]: "
                        f"chain break (prev_hash={entry.prev_hash[:16]}… "
                        f"expected={prev_hash[:16]}…)"
                    )

                prev_hash = entry.entry_hash

        ok = len(errors) == 0
        return ok, errors

    def verify_all(self) -> tuple[bool, Dict[str, list[str]]]:
        """Verify every audit log file in the audit directory."""
        all_errors: Dict[str, list[str]] = {}
        all_ok = True
        for log_file in sorted(_AUDIT_DIR.glob("audit_*.jsonl")):
            ok, errs = self.verify(log_file)
            if not ok:
                all_ok = False
                all_errors[log_file.name] = errs
        return all_ok, all_errors

    def get_stats(self) -> Dict[str, Any]:
        """Return summary statistics about the audit trail."""
        log_files = sorted(_AUDIT_DIR.glob("audit_*.jsonl"))
        total_entries = 0
        total_bytes = 0
        for f in log_files:
            total_bytes += f.stat().st_size
            with open(f, "r", encoding="utf-8") as fh:
                total_entries += sum(1 for line in fh if line.strip())
        return {
            "log_files": len(log_files),
            "total_entries": total_entries,
            "total_size_kb": round(total_bytes / 1024, 1),
            "current_file": self._log_path.name,
            "session_entries": self._entry_count,
            "chain_head": self._prev_hash[:24] + "…",
        }

    # ── Core append (private) ────────────────────────────────────────────

    def _append(
        self,
        *,
        event_type: str,
        actor: str = "jarvis",
        intent: str = "",
        input_text: str = "",
        output_text: str = "",
        risk_level: str = "L0",
        success: bool = True,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Build, redact, hash-chain, and write one audit entry."""
        with self._lock:
            # Rotate log file if day changed
            today = datetime.date.today().isoformat()
            if today != self._today:
                self._write_daily_digest()
                self._today = today
                self._log_path = _AUDIT_DIR / f"audit_{today}.jsonl"

            entry = AuditEntry(
                entry_id=uuid.uuid4().hex[:16],
                timestamp=datetime.datetime.now().isoformat(),
                session_id=self._session_id,
                event_type=event_type,
                actor=actor,
                intent=redact(intent),
                input_text=redact(input_text),
                output_text=redact(output_text),
                risk_level=risk_level,
                success=success,
                metadata=redact_dict(metadata or {}),
                prev_hash=self._prev_hash,
            )
            entry.entry_hash = entry.compute_hash()

            try:
                with open(self._log_path, "a", encoding="utf-8") as fh:
                    fh.write(entry.to_json_line() + "\n")

                self._prev_hash = entry.entry_hash
                _write_chain_head(self._prev_hash)
                self._entry_count += 1
            except Exception as exc:
                console.print(f"  [yellow]Audit write error: {exc}[/]")

    def _write_daily_digest(self) -> None:
        """Compute and write a SHA-256 digest for the current day's log."""
        if not self._log_path.exists():
            return
        try:
            h = hashlib.sha256()
            with open(self._log_path, "rb") as fh:
                for chunk in iter(lambda: fh.read(8192), b""):
                    h.update(chunk)
            digest_path = _AUDIT_DIR / f"digest_{self._today}.sha256"
            digest_path.write_text(
                f"{h.hexdigest()}  {self._log_path.name}\n", encoding="utf-8"
            )
        except Exception as exc:
            console.print(f"  [yellow]Digest write error: {exc}[/]")
