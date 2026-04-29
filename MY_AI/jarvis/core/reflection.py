"""
JARVIS — Self-Reflection Loop (LC-10).

Provides:
- Post-response quality self-assessment via LLM introspection
- Complexity-gated triggering (only activates for complex or high-risk tasks)
- Confidence scoring with automatic retry on low-confidence responses
- Chain-of-thought trace capture for feedback pipeline integration

The Self-Reflection loop sits AFTER the main Brain.process() call and:
1. Assesses whether the response adequately answers the user's query
2. Checks for potential errors, hallucinations, or incomplete answers
3. Can trigger a second-pass refinement if confidence is below threshold
4. Records reflection traces for the feedback agent (Layer 10)

Design Principle:
  - Only triggers for complex queries (multi-step, tool-heavy, high risk)
  - Adds < 2s overhead for simple queries (skipped entirely)
  - Max 1 retry to avoid infinite loops
"""
from __future__ import annotations

import datetime
import json
import re
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from rich.console import Console

console = Console()

# ── Storage ──────────────────────────────────────────────────────────────────
_REFLECT_DIR = Path(__file__).resolve().parents[1] / "data" / "reflections"
_REFLECT_DIR.mkdir(parents=True, exist_ok=True)

# Confidence threshold: below this, attempt a refinement
_CONFIDENCE_THRESHOLD = 0.65

# Complexity threshold: only reflect on queries above this score
_COMPLEXITY_THRESHOLD = 0.5

# Maximum retries to avoid infinite loops
_MAX_RETRIES = 1


# ── Complexity estimation ────────────────────────────────────────────────────
# Keywords and patterns that indicate a complex query needing reflection
_COMPLEX_INDICATORS = [
    # Multi-step tasks
    r"\b(?:and then|after that|first|second|third|step\s+\d|multi.?step)\b",
    # Tool-heavy commands
    r"\b(?:attack|scan|exploit|hack|pentest|recon|brute.?force)\b",
    # Code generation
    r"\b(?:write code|create.*script|implement|build.*program|code.*for)\b",
    # Analysis / reasoning
    r"\b(?:analyze|compare|evaluate|why|explain.*how|decision tree)\b",
    # File / system operations
    r"\b(?:delete|remove|install|configure|deploy|migrate)\b",
    # Long queries (proxy for complexity)
]

_COMPLEX_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _COMPLEX_INDICATORS]


def estimate_complexity(user_input: str) -> float:
    """
    Estimate query complexity on a 0.0–1.0 scale.
    Based on keyword matching, query length, and structure.
    """
    if not user_input:
        return 0.0

    score = 0.0
    text = user_input.lower()

    # Pattern matches (each adds 0.15)
    for pattern in _COMPLEX_PATTERNS:
        if pattern.search(text):
            score += 0.15

    # Length-based (longer queries tend to be more complex)
    word_count = len(text.split())
    if word_count > 20:
        score += 0.2
    elif word_count > 10:
        score += 0.1

    # Question complexity (multiple question marks, "how" + "why" combos)
    if text.count("?") > 1:
        score += 0.1
    if "how" in text and "why" in text:
        score += 0.1

    # Contains URLs or IPs (attack/analysis context)
    if re.search(r"https?://|(?:\d{1,3}\.){3}\d{1,3}", text):
        score += 0.15

    return min(score, 1.0)


# ── Data structures ──────────────────────────────────────────────────────────
@dataclass
class ReflectionTrace:
    """Record of a self-reflection assessment."""
    timestamp: str = ""
    session_id: str = ""
    user_input: str = ""
    original_response: str = ""
    complexity_score: float = 0.0
    confidence_score: float = 0.0
    reflection_triggered: bool = False
    reflection_assessment: str = ""
    issues_found: List[str] = field(default_factory=list)
    refined_response: str = ""
    refinement_used: bool = False
    latency_ms: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "ReflectionTrace":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# ── Self-Reflection Engine ───────────────────────────────────────────────────
class ReflectionEngine:
    """
    Post-response quality assessment with optional refinement.

    Usage::

        reflect = ReflectionEngine(session_id="abc", llm_fn=brain._ask_llm)
        result = reflect.maybe_reflect(
            user_input="explain the MITRE ATT&CK framework",
            response="The MITRE ATT&CK...",
            intent="hacking_explain",
        )
        # result.refinement_used tells you if the response was improved
    """

    def __init__(
        self,
        session_id: str = "",
        llm_fn: Optional[Callable[[str], str]] = None,
        confidence_threshold: float = _CONFIDENCE_THRESHOLD,
        complexity_threshold: float = _COMPLEXITY_THRESHOLD,
    ) -> None:
        self._session_id = session_id
        self._llm_fn = llm_fn
        self._confidence_threshold = confidence_threshold
        self._complexity_threshold = complexity_threshold
        self._traces: list[ReflectionTrace] = []
        self._total_reflections = 0
        self._total_refinements = 0

    @property
    def total_reflections(self) -> int:
        return self._total_reflections

    @property
    def total_refinements(self) -> int:
        return self._total_refinements

    def maybe_reflect(
        self,
        *,
        user_input: str,
        response: str,
        intent: str = "",
        force: bool = False,
    ) -> ReflectionTrace:
        """
        Assess the quality of a response and optionally refine it.

        Returns a ReflectionTrace. Check `.refinement_used` and
        `.refined_response` to see if a better response was generated.
        """
        t0 = time.perf_counter()
        complexity = estimate_complexity(user_input)

        trace = ReflectionTrace(
            timestamp=datetime.datetime.now().isoformat(),
            session_id=self._session_id,
            user_input=user_input[:500],
            original_response=response[:1000],
            complexity_score=round(complexity, 2),
        )

        # Gate: skip reflection for simple queries
        if not force and complexity < self._complexity_threshold:
            trace.reflection_triggered = False
            trace.confidence_score = 0.85  # assume good for simple queries
            trace.latency_ms = round((time.perf_counter() - t0) * 1000, 1)
            return trace

        # Reflection triggered
        trace.reflection_triggered = True
        self._total_reflections += 1

        if not self._llm_fn:
            # No LLM available — use heuristic assessment
            trace.confidence_score = self._heuristic_confidence(response)
            trace.reflection_assessment = "Heuristic assessment (no LLM available)"
            trace.latency_ms = round((time.perf_counter() - t0) * 1000, 1)
            self._persist_trace(trace)
            return trace

        # LLM-based reflection
        confidence, assessment, issues = self._llm_reflect(user_input, response)
        trace.confidence_score = confidence
        trace.reflection_assessment = assessment
        trace.issues_found = issues

        # If confidence is too low, attempt refinement
        if confidence < self._confidence_threshold and issues:
            refined = self._llm_refine(user_input, response, issues)
            if refined and refined != response:
                trace.refined_response = refined
                trace.refinement_used = True
                self._total_refinements += 1

        trace.latency_ms = round((time.perf_counter() - t0) * 1000, 1)
        self._persist_trace(trace)
        return trace

    def get_stats(self) -> Dict[str, Any]:
        """Return reflection statistics."""
        return {
            "total_reflections": self._total_reflections,
            "total_refinements": self._total_refinements,
            "refinement_rate": (
                round(self._total_refinements / max(self._total_reflections, 1) * 100, 1)
            ),
            "traces_stored": len(self._traces),
            "avg_confidence": round(
                sum(t.confidence_score for t in self._traces) / max(len(self._traces), 1), 2
            ),
        }

    # ── LLM reflection ───────────────────────────────────────────────────

    def _llm_reflect(
        self, user_input: str, response: str
    ) -> tuple[float, str, list[str]]:
        """
        Ask the LLM to self-assess the quality of its response.
        Returns (confidence, assessment_text, list_of_issues).
        """
        prompt = (
            "You are a quality assessment engine. Evaluate the following response "
            "to the user's query. Rate your confidence 0.0-1.0 and list any issues.\n\n"
            f"USER QUERY: {user_input[:500]}\n\n"
            f"RESPONSE: {response[:1500]}\n\n"
            "Reply in this exact JSON format:\n"
            '{"confidence": 0.XX, "assessment": "brief assessment", '
            '"issues": ["issue1", "issue2"]}\n'
            "If the response is good, use confidence >= 0.8 and empty issues list."
        )

        try:
            raw = self._llm_fn(prompt)
            # Extract JSON from response
            json_match = re.search(r"\{[^}]+\}", raw, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                confidence = float(data.get("confidence", 0.7))
                assessment = str(data.get("assessment", ""))
                issues = list(data.get("issues", []))
                return min(max(confidence, 0.0), 1.0), assessment, issues
        except Exception:
            pass

        # Fallback to heuristic
        conf = self._heuristic_confidence(response)
        return conf, "LLM reflection failed, using heuristic", []

    def _llm_refine(
        self, user_input: str, response: str, issues: list[str]
    ) -> Optional[str]:
        """Ask the LLM to refine the response based on identified issues."""
        issues_text = "\n".join(f"- {i}" for i in issues)
        prompt = (
            "The following response to a user query has quality issues. "
            "Please provide an improved response that addresses these issues.\n\n"
            f"USER QUERY: {user_input[:500]}\n\n"
            f"ORIGINAL RESPONSE: {response[:1500]}\n\n"
            f"ISSUES:\n{issues_text}\n\n"
            "Provide ONLY the improved response, nothing else."
        )

        try:
            refined = self._llm_fn(prompt)
            if refined and len(refined.strip()) > 20:
                return refined.strip()
        except Exception:
            pass

        return None

    # ── Heuristic confidence ─────────────────────────────────────────────

    @staticmethod
    def _heuristic_confidence(response: str) -> float:
        """
        Estimate response quality without an LLM call.
        Based on response structure, length, and quality signals.
        """
        if not response:
            return 0.1

        score = 0.5  # baseline

        # Length — too short or too long are both bad
        words = len(response.split())
        if 20 <= words <= 500:
            score += 0.15
        elif words < 10:
            score -= 0.2
        elif words > 2000:
            score -= 0.1

        # Structure — presence of formatting signals quality
        if any(marker in response for marker in ["•", "-", "1.", "```", "**"]):
            score += 0.1

        # Contains actionable content
        if any(word in response.lower() for word in ["step", "first", "then", "command", "run"]):
            score += 0.1

        # Error indicators
        if any(word in response.lower() for word in ["i don't know", "i'm not sure", "error", "failed"]):
            score -= 0.15

        # Repetition penalty (crude: check for repeated sentences)
        sentences = response.split(".")
        if len(sentences) > 3:
            unique_ratio = len(set(s.strip().lower() for s in sentences if s.strip())) / len(sentences)
            if unique_ratio < 0.5:
                score -= 0.2

        return min(max(score, 0.0), 1.0)

    # ── Persistence ──────────────────────────────────────────────────────

    def _persist_trace(self, trace: ReflectionTrace) -> None:
        """Append trace to daily log."""
        self._traces.append(trace)
        today = datetime.date.today().isoformat()
        log_file = _REFLECT_DIR / f"reflections_{today}.jsonl"
        try:
            with open(log_file, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(trace.to_dict(), default=str) + "\n")
        except Exception:
            pass
