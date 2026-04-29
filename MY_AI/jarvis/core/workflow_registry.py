"""
JARVIS — Workflow Registry & Domain Packs (LC-24).

Provides:
- Workflow registry: store, discover, and execute reusable workflow templates
- Domain packs: pre-built workflow collections for specific domains
  (Security, Development, DevOps, Research, System Admin)
- Parameterized execution: workflows accept variables for customization
- Pack management: list, inspect, activate, and extend packs
- Execution history: track which workflows were run and their outcomes

Built-in Domain Packs:
  SECURITY  — Pentest, recon, vulnerability assessment, reporting
  CODING    — Code review, refactor, test generation, documentation
  DEVOPS    — Deploy, monitor, troubleshoot, backup
  RESEARCH  — Literature search, analysis, summarize, compare
  SYSADMIN  — Health check, cleanup, update, audit

Storage:
  jarvis/data/workflows/
    registry.json          ← master workflow registry
    packs/                 ← domain pack definitions
    history.jsonl          ← execution history
"""
from __future__ import annotations

import datetime
import json
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

# ── Storage ──────────────────────────────────────────────────────────────────
_WORKFLOW_DIR = Path(__file__).resolve().parents[1] / "data" / "workflows"
_WORKFLOW_DIR.mkdir(parents=True, exist_ok=True)
_PACKS_DIR = _WORKFLOW_DIR / "packs"
_PACKS_DIR.mkdir(parents=True, exist_ok=True)
_REGISTRY_FILE = _WORKFLOW_DIR / "registry.json"
_HISTORY_FILE = _WORKFLOW_DIR / "history.jsonl"


# ── Data structures ──────────────────────────────────────────────────────────
@dataclass
class WorkflowStep:
    """A single step within a workflow template."""
    step_id: str = ""
    title: str = ""
    action_type: str = "llm_query"   # llm_query, tool_call, shell, prompt_user
    action_template: str = ""         # template string with {param} placeholders
    depends_on: List[str] = field(default_factory=list)
    risk_level: str = "L0"

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "WorkflowStep":
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


@dataclass
class Workflow:
    """A reusable workflow template."""
    workflow_id: str = ""
    name: str = ""
    description: str = ""
    domain: str = ""                  # security, coding, devops, research, sysadmin
    tags: List[str] = field(default_factory=list)
    parameters: List[str] = field(default_factory=list)  # required params
    steps: List[WorkflowStep] = field(default_factory=list)
    created_at: str = ""
    author: str = "jarvis"
    version: str = "1.0"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["steps"] = [s.to_dict() if isinstance(s, WorkflowStep) else s for s in self.steps]
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "Workflow":
        steps = [WorkflowStep.from_dict(s) if isinstance(s, dict) else s for s in d.get("steps", [])]
        filtered = {k: v for k, v in d.items() if k in cls.__dataclass_fields__ and k != "steps"}
        return cls(steps=steps, **filtered)


@dataclass
class WorkflowExecution:
    """Record of a workflow execution."""
    execution_id: str = ""
    workflow_id: str = ""
    workflow_name: str = ""
    parameters: Dict[str, str] = field(default_factory=dict)
    started_at: str = ""
    completed_at: str = ""
    status: str = "PENDING"  # PENDING, RUNNING, COMPLETED, FAILED
    steps_completed: int = 0
    steps_total: int = 0
    result_summary: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ── Built-in Domain Packs ────────────────────────────────────────────────────
def _build_security_pack() -> list[Workflow]:
    return [
        Workflow(
            workflow_id="sec_recon", name="Full Reconnaissance",
            description="Complete target reconnaissance: DNS, ports, services, web tech",
            domain="security", tags=["recon", "pentest", "osint"],
            parameters=["target"],
            steps=[
                WorkflowStep("s0", "DNS Enumeration", "tool_call", "Enumerate DNS records for {target}"),
                WorkflowStep("s1", "Port Scan", "tool_call", "Scan open ports on {target}", ["s0"]),
                WorkflowStep("s2", "Service Detection", "tool_call", "Identify services on {target}", ["s1"]),
                WorkflowStep("s3", "Web Fingerprint", "tool_call", "Fingerprint web technologies on {target}", ["s2"]),
                WorkflowStep("s4", "Report", "llm_query", "Compile recon report for {target}", ["s3"]),
            ],
        ),
        Workflow(
            workflow_id="sec_vuln_assess", name="Vulnerability Assessment",
            description="Automated vulnerability scanning and analysis",
            domain="security", tags=["vuln", "scan", "assessment"],
            parameters=["target"],
            steps=[
                WorkflowStep("s0", "Scan", "tool_call", "Run vulnerability scan against {target}"),
                WorkflowStep("s1", "Analyze Results", "llm_query", "Analyze vulnerability scan results for {target}", ["s0"]),
                WorkflowStep("s2", "Prioritize", "llm_query", "Prioritize vulnerabilities by severity and exploitability", ["s1"]),
                WorkflowStep("s3", "Remediation Plan", "llm_query", "Create remediation plan for found vulnerabilities", ["s2"]),
            ],
        ),
        Workflow(
            workflow_id="sec_web_pentest", name="Web Application Pentest",
            description="Full web application penetration testing workflow",
            domain="security", tags=["web", "pentest", "xss", "sqli"],
            parameters=["target"],
            steps=[
                WorkflowStep("s0", "Spider & Crawl", "tool_call", "Spider and map {target}", risk_level="L1"),
                WorkflowStep("s1", "XSS Testing", "tool_call", "Test for XSS on {target}", ["s0"], "L2"),
                WorkflowStep("s2", "SQL Injection", "tool_call", "Test for SQLi on {target}", ["s0"], "L2"),
                WorkflowStep("s3", "Auth Testing", "tool_call", "Test authentication on {target}", ["s0"], "L2"),
                WorkflowStep("s4", "Report", "llm_query", "Generate pentest report for {target}", ["s1", "s2", "s3"]),
            ],
        ),
    ]


def _build_coding_pack() -> list[Workflow]:
    return [
        Workflow(
            workflow_id="code_review", name="Code Review",
            description="Automated code review with quality and security analysis",
            domain="coding", tags=["review", "quality", "security"],
            parameters=["file_path"],
            steps=[
                WorkflowStep("s0", "Read Code", "tool_call", "Read and parse {file_path}"),
                WorkflowStep("s1", "Quality Analysis", "llm_query", "Analyze code quality of {file_path}", ["s0"]),
                WorkflowStep("s2", "Security Scan", "llm_query", "Check for security issues in {file_path}", ["s0"]),
                WorkflowStep("s3", "Suggestions", "llm_query", "Provide improvement suggestions for {file_path}", ["s1", "s2"]),
            ],
        ),
        Workflow(
            workflow_id="code_test_gen", name="Test Generation",
            description="Generate comprehensive test cases for existing code",
            domain="coding", tags=["test", "unittest", "coverage"],
            parameters=["file_path"],
            steps=[
                WorkflowStep("s0", "Analyze Code", "tool_call", "Analyze functions in {file_path}"),
                WorkflowStep("s1", "Generate Tests", "llm_query", "Generate unit tests for {file_path}", ["s0"]),
                WorkflowStep("s2", "Edge Cases", "llm_query", "Generate edge case tests for {file_path}", ["s0"]),
                WorkflowStep("s3", "Write Tests", "tool_call", "Write test file for {file_path}", ["s1", "s2"]),
            ],
        ),
        Workflow(
            workflow_id="code_doc_gen", name="Documentation Generator",
            description="Auto-generate documentation from source code",
            domain="coding", tags=["docs", "docstring", "readme"],
            parameters=["project_path"],
            steps=[
                WorkflowStep("s0", "Scan Project", "tool_call", "Scan {project_path} structure"),
                WorkflowStep("s1", "Generate Docs", "llm_query", "Generate documentation for {project_path}", ["s0"]),
                WorkflowStep("s2", "API Reference", "llm_query", "Generate API reference for {project_path}", ["s0"]),
                WorkflowStep("s3", "Write Files", "tool_call", "Write documentation files", ["s1", "s2"]),
            ],
        ),
    ]


def _build_devops_pack() -> list[Workflow]:
    return [
        Workflow(
            workflow_id="devops_health", name="System Health Check",
            description="Comprehensive system health and performance check",
            domain="devops", tags=["health", "monitoring", "performance"],
            parameters=[],
            steps=[
                WorkflowStep("s0", "CPU & Memory", "shell", "Check CPU and memory usage"),
                WorkflowStep("s1", "Disk Space", "shell", "Check disk space usage"),
                WorkflowStep("s2", "Network", "shell", "Check network connectivity"),
                WorkflowStep("s3", "Services", "shell", "Check critical service status"),
                WorkflowStep("s4", "Report", "llm_query", "Summarize system health", ["s0", "s1", "s2", "s3"]),
            ],
        ),
        Workflow(
            workflow_id="devops_backup", name="Backup Procedure",
            description="Automated backup of critical data and configs",
            domain="devops", tags=["backup", "recovery", "data"],
            parameters=["backup_path"],
            steps=[
                WorkflowStep("s0", "Identify Targets", "llm_query", "List files to backup to {backup_path}"),
                WorkflowStep("s1", "Create Archive", "shell", "Create backup archive at {backup_path}", ["s0"]),
                WorkflowStep("s2", "Verify Integrity", "shell", "Verify backup integrity at {backup_path}", ["s1"]),
                WorkflowStep("s3", "Log", "llm_query", "Log backup completion to {backup_path}", ["s2"]),
            ],
        ),
    ]


def _build_research_pack() -> list[Workflow]:
    return [
        Workflow(
            workflow_id="research_topic", name="Topic Deep Dive",
            description="Comprehensive research on a topic with structured output",
            domain="research", tags=["research", "analysis", "learning"],
            parameters=["topic"],
            steps=[
                WorkflowStep("s0", "Define Scope", "llm_query", "Define research scope for {topic}"),
                WorkflowStep("s1", "Gather Info", "tool_call", "Search and gather information on {topic}", ["s0"]),
                WorkflowStep("s2", "Analyze", "llm_query", "Analyze findings about {topic}", ["s1"]),
                WorkflowStep("s3", "Synthesize", "llm_query", "Create structured summary of {topic}", ["s2"]),
                WorkflowStep("s4", "Store", "tool_call", "Store research on {topic} in memory", ["s3"]),
            ],
        ),
        Workflow(
            workflow_id="research_compare", name="Comparative Analysis",
            description="Compare multiple technologies, tools, or approaches",
            domain="research", tags=["compare", "analysis", "decision"],
            parameters=["option_a", "option_b"],
            steps=[
                WorkflowStep("s0", "Research A", "llm_query", "Research {option_a} in detail"),
                WorkflowStep("s1", "Research B", "llm_query", "Research {option_b} in detail"),
                WorkflowStep("s2", "Compare", "llm_query", "Compare {option_a} vs {option_b}", ["s0", "s1"]),
                WorkflowStep("s3", "Recommend", "llm_query", "Make recommendation between {option_a} and {option_b}", ["s2"]),
            ],
        ),
    ]


def _build_sysadmin_pack() -> list[Workflow]:
    return [
        Workflow(
            workflow_id="sys_cleanup", name="System Cleanup",
            description="Clean temporary files, logs, and reclaim disk space",
            domain="sysadmin", tags=["cleanup", "disk", "maintenance"],
            parameters=[],
            steps=[
                WorkflowStep("s0", "Scan Temp", "shell", "Scan temporary file directories"),
                WorkflowStep("s1", "Scan Logs", "shell", "Identify old log files"),
                WorkflowStep("s2", "Calculate", "llm_query", "Calculate reclaimable space", ["s0", "s1"]),
                WorkflowStep("s3", "Clean", "shell", "Execute cleanup", ["s2"], "L2"),
                WorkflowStep("s4", "Report", "llm_query", "Report cleanup results", ["s3"]),
            ],
        ),
        Workflow(
            workflow_id="sys_audit", name="Security Audit",
            description="Basic security audit: users, ports, permissions, updates",
            domain="sysadmin", tags=["audit", "security", "hardening"],
            parameters=[],
            steps=[
                WorkflowStep("s0", "User Audit", "shell", "List users and permissions"),
                WorkflowStep("s1", "Port Audit", "shell", "Check open ports and listeners"),
                WorkflowStep("s2", "Update Check", "shell", "Check for pending system updates"),
                WorkflowStep("s3", "Analysis", "llm_query", "Analyze security posture", ["s0", "s1", "s2"]),
                WorkflowStep("s4", "Recommendations", "llm_query", "Generate hardening recommendations", ["s3"]),
            ],
        ),
    ]


# ── Workflow Registry ────────────────────────────────────────────────────────
class WorkflowRegistry:
    """
    Central registry for all workflow templates and domain packs.

    Usage::

        registry = WorkflowRegistry()
        workflows = registry.list_workflows(domain="security")
        wf = registry.get_workflow("sec_recon")
        execution = registry.execute(wf, params={"target": "example.com"})
    """

    def __init__(self) -> None:
        self._workflows: Dict[str, Workflow] = {}
        self._load_registry()
        if not self._workflows:
            self._install_default_packs()

    # ── Pack management ──────────────────────────────────────────────────

    def _install_default_packs(self) -> None:
        """Install all built-in domain packs."""
        all_packs = {
            "security": _build_security_pack(),
            "coding": _build_coding_pack(),
            "devops": _build_devops_pack(),
            "research": _build_research_pack(),
            "sysadmin": _build_sysadmin_pack(),
        }

        for domain, workflows in all_packs.items():
            for wf in workflows:
                wf.created_at = datetime.datetime.now().isoformat()
                self._workflows[wf.workflow_id] = wf

        self._save_registry()
        console.print(
            f"  [dim green]Workflow registry initialized — "
            f"{len(self._workflows)} workflows across "
            f"{len(all_packs)} domain packs.[/]"
        )

    def add_workflow(self, workflow: Workflow) -> None:
        """Add a workflow to the registry."""
        if not workflow.workflow_id:
            workflow.workflow_id = uuid.uuid4().hex[:12]
        if not workflow.created_at:
            workflow.created_at = datetime.datetime.now().isoformat()
        self._workflows[workflow.workflow_id] = workflow
        self._save_registry()

    def remove_workflow(self, workflow_id: str) -> bool:
        """Remove a workflow from the registry."""
        if workflow_id in self._workflows:
            del self._workflows[workflow_id]
            self._save_registry()
            return True
        return False

    # ── Discovery ────────────────────────────────────────────────────────

    def list_workflows(self, domain: Optional[str] = None) -> list[Workflow]:
        """List all workflows, optionally filtered by domain."""
        workflows = list(self._workflows.values())
        if domain:
            workflows = [w for w in workflows if w.domain == domain.lower()]
        return workflows

    def get_workflow(self, workflow_id: str) -> Optional[Workflow]:
        """Get a workflow by ID."""
        return self._workflows.get(workflow_id)

    def search(self, query: str) -> list[Workflow]:
        """Search workflows by name, description, or tags."""
        query_lower = query.lower()
        results = []
        for wf in self._workflows.values():
            if (
                query_lower in wf.name.lower()
                or query_lower in wf.description.lower()
                or any(query_lower in tag for tag in wf.tags)
            ):
                results.append(wf)
        return results

    def list_domains(self) -> list[str]:
        """List all available domains."""
        return sorted(set(wf.domain for wf in self._workflows.values()))

    # ── Execution ────────────────────────────────────────────────────────

    def execute(
        self,
        workflow: Workflow,
        params: Dict[str, str],
        execute_fn: Optional[Callable] = None,
    ) -> WorkflowExecution:
        """
        Execute a workflow with the given parameters.
        Returns a WorkflowExecution record.
        """
        execution = WorkflowExecution(
            execution_id=uuid.uuid4().hex[:12],
            workflow_id=workflow.workflow_id,
            workflow_name=workflow.name,
            parameters=params,
            started_at=datetime.datetime.now().isoformat(),
            status="RUNNING",
            steps_total=len(workflow.steps),
        )

        console.print(
            Panel(
                f"[bold cyan]Executing: {workflow.name}[/]\n"
                f"  Domain: {workflow.domain}\n"
                f"  Steps: {len(workflow.steps)}\n"
                f"  Params: {json.dumps(params)}",
                border_style="cyan",
            )
        )

        # Execute steps (simplified — DAG executor handles complex cases)
        for step in workflow.steps:
            # Substitute parameters in action template
            action = step.action_template
            for key, val in params.items():
                action = action.replace(f"{{{key}}}", val)

            console.print(f"  [cyan]▶ {step.title}[/] [dim]{action}[/]")

            if execute_fn:
                try:
                    execute_fn(step, action)
                    execution.steps_completed += 1
                    console.print(f"  [green]✔ {step.title}[/]")
                except Exception as exc:
                    console.print(f"  [red]✘ {step.title}: {exc}[/]")
            else:
                # Simulate execution
                execution.steps_completed += 1
                console.print(f"  [green]✔ {step.title} [dim](simulated)[/]")

        execution.status = (
            "COMPLETED" if execution.steps_completed == execution.steps_total
            else "FAILED"
        )
        execution.completed_at = datetime.datetime.now().isoformat()
        execution.result_summary = (
            f"{execution.steps_completed}/{execution.steps_total} steps completed"
        )

        self._log_execution(execution)
        return execution

    # ── Display ──────────────────────────────────────────────────────────

    def print_registry(self) -> str:
        """Print the workflow registry as a Rich table. Returns spoken summary."""
        table = Table(title="JARVIS Workflow Registry", border_style="cyan")
        table.add_column("ID", style="dim")
        table.add_column("Name", style="bold bright_blue")
        table.add_column("Domain", style="yellow")
        table.add_column("Steps", style="green", justify="right")
        table.add_column("Params", style="dim")

        for wf in sorted(self._workflows.values(), key=lambda w: w.domain):
            table.add_row(
                wf.workflow_id,
                wf.name,
                wf.domain,
                str(len(wf.steps)),
                ", ".join(wf.parameters) or "—",
            )

        console.print(table)

        domains = self.list_domains()
        return (
            f"Workflow registry has {len(self._workflows)} workflows "
            f"across {len(domains)} domains: {', '.join(domains)}."
        )

    # ── Persistence ──────────────────────────────────────────────────────

    def _save_registry(self) -> None:
        data = {wid: wf.to_dict() for wid, wf in self._workflows.items()}
        try:
            tmp = _REGISTRY_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
            tmp.replace(_REGISTRY_FILE)
        except Exception:
            pass

    def _load_registry(self) -> None:
        if not _REGISTRY_FILE.exists():
            return
        try:
            data = json.loads(_REGISTRY_FILE.read_text(encoding="utf-8"))
            for wid, wf_data in data.items():
                self._workflows[wid] = Workflow.from_dict(wf_data)
        except Exception:
            pass

    @staticmethod
    def _log_execution(execution: WorkflowExecution) -> None:
        try:
            with open(_HISTORY_FILE, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(execution.to_dict(), default=str) + "\n")
        except Exception:
            pass
