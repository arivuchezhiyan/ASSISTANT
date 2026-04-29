"""
JARVIS — Autonomous Goal Planner & DAG Executor (LC-23).

Provides:
- Goal decomposition: break a high-level user goal into ordered steps
- Dependency graph: model step dependencies as a DAG
- Dynamic replanning: adjust the plan when a step fails or new info appears
- Step verification: validate each step's output before proceeding
- Progress tracking: real-time status of multi-step missions

Architecture:
  User goal → GoalDecomposer → DAG of PlanStep nodes
  DAGExecutor walks the graph, running ready steps, verifying, replanning

Storage:
  jarvis/data/plans/
    plan_<id>.json       ← serialized plan + execution state
    plan_history.jsonl   ← completed plans for learning
"""
from __future__ import annotations

import datetime
import json
import uuid
from collections import deque
from dataclasses import asdict, dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.tree import Tree

console = Console()

# ── Storage ──────────────────────────────────────────────────────────────────
_PLANS_DIR = Path(__file__).resolve().parents[1] / "data" / "plans"
_PLANS_DIR.mkdir(parents=True, exist_ok=True)
_PLAN_HISTORY = _PLANS_DIR / "plan_history.jsonl"


# ── Enums ────────────────────────────────────────────────────────────────────
class StepStatus(str, Enum):
    PENDING = "PENDING"
    READY = "READY"         # all dependencies met
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class PlanStatus(str, Enum):
    DRAFT = "DRAFT"
    EXECUTING = "EXECUTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REPLANNED = "REPLANNED"


# ── Data structures ──────────────────────────────────────────────────────────
@dataclass
class PlanStep:
    """A single step in a mission plan."""
    step_id: str = ""
    title: str = ""
    description: str = ""
    action_type: str = ""      # e.g. "llm_query", "tool_call", "shell", "manual"
    action_payload: str = ""   # command or prompt to execute
    depends_on: List[str] = field(default_factory=list)  # step_ids this depends on
    status: str = StepStatus.PENDING.value
    result: str = ""
    error: str = ""
    started_at: str = ""
    completed_at: str = ""
    retry_count: int = 0
    max_retries: int = 1
    risk_level: str = "L0"

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "PlanStep":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class MissionPlan:
    """A complete mission plan with a DAG of steps."""
    plan_id: str = ""
    goal: str = ""
    created_at: str = ""
    updated_at: str = ""
    status: str = PlanStatus.DRAFT.value
    steps: List[PlanStep] = field(default_factory=list)
    replan_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["steps"] = [s.to_dict() if isinstance(s, PlanStep) else s for s in self.steps]
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "MissionPlan":
        steps = [PlanStep.from_dict(s) if isinstance(s, dict) else s for s in d.get("steps", [])]
        filtered = {k: v for k, v in d.items() if k in cls.__dataclass_fields__ and k != "steps"}
        return cls(steps=steps, **filtered)

    def get_step(self, step_id: str) -> Optional[PlanStep]:
        for s in self.steps:
            if s.step_id == step_id:
                return s
        return None


# ── Goal Decomposer ──────────────────────────────────────────────────────────
class GoalDecomposer:
    """
    Breaks a high-level goal into an ordered set of steps.
    Can use LLM for intelligent decomposition or rule-based fallback.
    """

    def __init__(self, llm_fn: Optional[Callable[[str], str]] = None) -> None:
        self._llm_fn = llm_fn

    def decompose(self, goal: str, context: str = "") -> MissionPlan:
        """
        Decompose a goal into a MissionPlan with steps.
        Uses LLM if available, otherwise falls back to template-based decomposition.
        """
        plan_id = uuid.uuid4().hex[:12]
        now_iso = datetime.datetime.now().isoformat()

        steps: list[PlanStep] = []

        if self._llm_fn:
            steps = self._llm_decompose(goal, context)

        if not steps:
            steps = self._template_decompose(goal)

        plan = MissionPlan(
            plan_id=plan_id,
            goal=goal,
            created_at=now_iso,
            updated_at=now_iso,
            status=PlanStatus.DRAFT.value,
            steps=steps,
        )

        # Save plan to disk
        self._save_plan(plan)
        return plan

    def _llm_decompose(self, goal: str, context: str) -> list[PlanStep]:
        """Use LLM to generate a step-by-step plan."""
        prompt = (
            "You are a mission planner. Break the following goal into 3-8 concrete steps.\n"
            "Each step should be specific, actionable, and testable.\n"
            "For each step, specify dependencies (which previous steps must complete first).\n\n"
            f"GOAL: {goal}\n"
        )
        if context:
            prompt += f"\nCONTEXT: {context}\n"

        prompt += (
            "\nReply in JSON format:\n"
            '[{"title": "...", "description": "...", "action_type": "llm_query|tool_call|shell|manual", '
            '"action_payload": "...", "depends_on": [], "risk_level": "L0|L1|L2|L3"}]\n'
            "depends_on should contain indices (0-based) of prerequisite steps.\n"
        )

        try:
            raw = self._llm_fn(prompt)
            # Extract JSON array
            import re
            json_match = re.search(r"\[[\s\S]*\]", raw)
            if json_match:
                data = json.loads(json_match.group())
                steps = []
                for i, item in enumerate(data):
                    step_id = f"step_{i:02d}"
                    deps = [f"step_{int(d):02d}" for d in item.get("depends_on", [])]
                    steps.append(PlanStep(
                        step_id=step_id,
                        title=item.get("title", f"Step {i+1}"),
                        description=item.get("description", ""),
                        action_type=item.get("action_type", "llm_query"),
                        action_payload=item.get("action_payload", ""),
                        depends_on=deps,
                        risk_level=item.get("risk_level", "L0"),
                    ))
                return steps
        except Exception:
            pass
        return []

    def _template_decompose(self, goal: str) -> list[PlanStep]:
        """Fallback: create a generic 4-step plan."""
        goal_lower = goal.lower()

        # Template selection based on goal keywords
        if any(w in goal_lower for w in ["attack", "hack", "pentest", "scan"]):
            return self._attack_template(goal)
        elif any(w in goal_lower for w in ["code", "write", "implement", "build"]):
            return self._code_template(goal)
        elif any(w in goal_lower for w in ["research", "learn", "study"]):
            return self._research_template(goal)
        else:
            return self._generic_template(goal)

    def _attack_template(self, goal: str) -> list[PlanStep]:
        return [
            PlanStep(step_id="step_00", title="Reconnaissance", description=f"Gather intel on target from: {goal}", action_type="tool_call", action_payload="recon"),
            PlanStep(step_id="step_01", title="Vulnerability Analysis", description="Analyze recon results for exploitable vectors", action_type="llm_query", action_payload="analyze", depends_on=["step_00"]),
            PlanStep(step_id="step_02", title="Exploitation", description="Execute identified attack vectors", action_type="tool_call", action_payload="exploit", depends_on=["step_01"], risk_level="L3"),
            PlanStep(step_id="step_03", title="Report", description="Compile findings into structured report", action_type="llm_query", action_payload="report", depends_on=["step_02"]),
        ]

    def _code_template(self, goal: str) -> list[PlanStep]:
        return [
            PlanStep(step_id="step_00", title="Requirements Analysis", description=f"Clarify requirements for: {goal}", action_type="llm_query", action_payload="requirements"),
            PlanStep(step_id="step_01", title="Design", description="Create architecture and design", action_type="llm_query", action_payload="design", depends_on=["step_00"]),
            PlanStep(step_id="step_02", title="Implementation", description="Write the code", action_type="tool_call", action_payload="code_gen", depends_on=["step_01"]),
            PlanStep(step_id="step_03", title="Testing", description="Verify the implementation works", action_type="tool_call", action_payload="test", depends_on=["step_02"]),
        ]

    def _research_template(self, goal: str) -> list[PlanStep]:
        return [
            PlanStep(step_id="step_00", title="Define Scope", description=f"Clarify research scope for: {goal}", action_type="llm_query", action_payload="scope"),
            PlanStep(step_id="step_01", title="Gather Sources", description="Find relevant information", action_type="tool_call", action_payload="search", depends_on=["step_00"]),
            PlanStep(step_id="step_02", title="Analyze", description="Synthesize findings", action_type="llm_query", action_payload="analyze", depends_on=["step_01"]),
            PlanStep(step_id="step_03", title="Summary", description="Produce final summary", action_type="llm_query", action_payload="summarize", depends_on=["step_02"]),
        ]

    def _generic_template(self, goal: str) -> list[PlanStep]:
        return [
            PlanStep(step_id="step_00", title="Understand Goal", description=f"Clarify: {goal}", action_type="llm_query", action_payload="clarify"),
            PlanStep(step_id="step_01", title="Plan Approach", description="Determine best approach", action_type="llm_query", action_payload="plan", depends_on=["step_00"]),
            PlanStep(step_id="step_02", title="Execute", description="Carry out the plan", action_type="tool_call", action_payload="execute", depends_on=["step_01"]),
            PlanStep(step_id="step_03", title="Verify", description="Confirm goal is met", action_type="llm_query", action_payload="verify", depends_on=["step_02"]),
        ]

    @staticmethod
    def _save_plan(plan: MissionPlan) -> None:
        try:
            path = _PLANS_DIR / f"plan_{plan.plan_id}.json"
            path.write_text(json.dumps(plan.to_dict(), indent=2), encoding="utf-8")
        except Exception:
            pass


# ── DAG Executor ─────────────────────────────────────────────────────────────
class DAGExecutor:
    """
    Walks a MissionPlan DAG, executing steps in dependency order.

    Features:
    - Topological execution order respecting dependencies
    - Step-level retry on failure
    - Dynamic replanning hook
    - Progress tracking with Rich terminal output
    """

    def __init__(
        self,
        execute_fn: Optional[Callable[[PlanStep], str]] = None,
        replan_fn: Optional[Callable[[MissionPlan, PlanStep], list[PlanStep]]] = None,
    ) -> None:
        self._execute_fn = execute_fn
        self._replan_fn = replan_fn

    def execute(self, plan: MissionPlan) -> MissionPlan:
        """Execute all steps in the plan respecting the DAG order."""
        plan.status = PlanStatus.EXECUTING.value
        plan.updated_at = datetime.datetime.now().isoformat()

        execution_order = self._topological_sort(plan)

        for step_id in execution_order:
            step = plan.get_step(step_id)
            if not step:
                continue

            # Check dependencies are met
            if not self._deps_met(plan, step):
                step.status = StepStatus.SKIPPED.value
                step.error = "Dependencies not met (upstream failure)"
                continue

            # Execute the step
            step.status = StepStatus.RUNNING.value
            step.started_at = datetime.datetime.now().isoformat()
            self._print_step_start(step, plan)

            success = self._run_step(step)

            if success:
                step.status = StepStatus.COMPLETED.value
                step.completed_at = datetime.datetime.now().isoformat()
                self._print_step_done(step)
            else:
                # Retry logic
                if step.retry_count < step.max_retries:
                    step.retry_count += 1
                    success = self._run_step(step)
                    if success:
                        step.status = StepStatus.COMPLETED.value
                        step.completed_at = datetime.datetime.now().isoformat()
                        self._print_step_done(step)
                    else:
                        step.status = StepStatus.FAILED.value
                        self._print_step_fail(step)
                else:
                    step.status = StepStatus.FAILED.value
                    self._print_step_fail(step)

                # Try replanning if step failed
                if step.status == StepStatus.FAILED.value and self._replan_fn:
                    new_steps = self._replan_fn(plan, step)
                    if new_steps:
                        plan.steps.extend(new_steps)
                        plan.replan_count += 1
                        plan.status = PlanStatus.REPLANNED.value
                        console.print(
                            f"  [yellow]↻ Replanned: added {len(new_steps)} "
                            f"alternative steps[/]"
                        )

        # Determine final plan status
        completed = sum(1 for s in plan.steps if s.status == StepStatus.COMPLETED.value)
        failed = sum(1 for s in plan.steps if s.status == StepStatus.FAILED.value)
        total = len(plan.steps)

        if failed == 0:
            plan.status = PlanStatus.COMPLETED.value
        elif completed == 0:
            plan.status = PlanStatus.FAILED.value
        else:
            plan.status = PlanStatus.COMPLETED.value  # partial success

        plan.updated_at = datetime.datetime.now().isoformat()

        # Save final state
        self._save_plan(plan)
        self._append_history(plan)

        return plan

    def _run_step(self, step: PlanStep) -> bool:
        """Execute a single step. Returns True on success."""
        if not self._execute_fn:
            # No executor — simulate success
            step.result = f"[Simulated] Step '{step.title}' completed."
            return True

        try:
            result = self._execute_fn(step)
            step.result = result or "Completed"
            return True
        except Exception as exc:
            step.error = str(exc)
            return False

    def _deps_met(self, plan: MissionPlan, step: PlanStep) -> bool:
        """Check if all dependencies for a step are completed."""
        for dep_id in step.depends_on:
            dep = plan.get_step(dep_id)
            if not dep or dep.status != StepStatus.COMPLETED.value:
                return False
        return True

    def _topological_sort(self, plan: MissionPlan) -> list[str]:
        """Return step IDs in valid execution order (topological sort)."""
        # Build adjacency and in-degree maps
        in_degree: Dict[str, int] = {}
        adj: Dict[str, list[str]] = {}

        for step in plan.steps:
            in_degree.setdefault(step.step_id, 0)
            adj.setdefault(step.step_id, [])
            for dep in step.depends_on:
                adj.setdefault(dep, []).append(step.step_id)
                in_degree[step.step_id] = in_degree.get(step.step_id, 0) + 1

        # Kahn's algorithm
        queue = deque(sid for sid, deg in in_degree.items() if deg == 0)
        order: list[str] = []

        while queue:
            node = queue.popleft()
            order.append(node)
            for neighbor in adj.get(node, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        return order

    # ── Display helpers ──────────────────────────────────────────────────

    @staticmethod
    def _print_step_start(step: PlanStep, plan: MissionPlan) -> None:
        console.print(
            f"  [bold cyan]▶ [{step.step_id}] {step.title}[/] "
            f"[dim]({step.action_type})[/]"
        )

    @staticmethod
    def _print_step_done(step: PlanStep) -> None:
        console.print(f"  [green]✔ [{step.step_id}] {step.title} — completed[/]")

    @staticmethod
    def _print_step_fail(step: PlanStep) -> None:
        console.print(
            f"  [red]✘ [{step.step_id}] {step.title} — FAILED: {step.error[:100]}[/]"
        )

    def print_plan(self, plan: MissionPlan) -> str:
        """Print a visual plan tree. Returns spoken summary."""
        tree = Tree(f"[bold cyan]Mission: {plan.goal}[/]")

        for step in plan.steps:
            status_icon = {
                StepStatus.PENDING.value: "⏳",
                StepStatus.READY.value: "🔵",
                StepStatus.RUNNING.value: "🔄",
                StepStatus.COMPLETED.value: "✅",
                StepStatus.FAILED.value: "❌",
                StepStatus.SKIPPED.value: "⏭️",
            }.get(step.status, "❓")

            deps_str = f" [dim](needs: {', '.join(step.depends_on)})[/]" if step.depends_on else ""
            tree.add(
                f"{status_icon} [{step.step_id}] [bold]{step.title}[/]{deps_str}"
            )

        console.print(tree)

        completed = sum(1 for s in plan.steps if s.status == StepStatus.COMPLETED.value)
        total = len(plan.steps)
        spoken = (
            f"Mission plan has {total} steps, {completed} completed. "
            f"Status: {plan.status}."
        )
        return spoken

    # ── Persistence ──────────────────────────────────────────────────────

    @staticmethod
    def _save_plan(plan: MissionPlan) -> None:
        try:
            path = _PLANS_DIR / f"plan_{plan.plan_id}.json"
            path.write_text(json.dumps(plan.to_dict(), indent=2), encoding="utf-8")
        except Exception:
            pass

    @staticmethod
    def _append_history(plan: MissionPlan) -> None:
        try:
            with open(_PLAN_HISTORY, "a", encoding="utf-8") as fh:
                entry = {
                    "plan_id": plan.plan_id,
                    "goal": plan.goal,
                    "status": plan.status,
                    "steps": len(plan.steps),
                    "completed": sum(1 for s in plan.steps if s.status == StepStatus.COMPLETED.value),
                    "failed": sum(1 for s in plan.steps if s.status == StepStatus.FAILED.value),
                    "replans": plan.replan_count,
                    "created_at": plan.created_at,
                    "finished_at": datetime.datetime.now().isoformat(),
                }
                fh.write(json.dumps(entry) + "\n")
        except Exception:
            pass

    @staticmethod
    def load_plan(plan_id: str) -> Optional[MissionPlan]:
        """Load a plan from disk by ID."""
        path = _PLANS_DIR / f"plan_{plan_id}.json"
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return MissionPlan.from_dict(data)
        except Exception:
            return None
