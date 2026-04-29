"""
JARVIS — Main System Daemon (Full Power Edition).

Features:
- Boot animation + spoken greeting every login
- Live weather + 5-day forecast on startup
- Continuous wake-word "Hey Jarvis" listener
- Uncensored local LLM (dolphin-mistral via Ollama) 
- Persistent vector memory — grows forever
- Self-learning: reads any URL / PDF / file / YouTube
- Self-execution: writes and runs Python code to implement ideas
- Full desktop automation: any app, any website
- Unreal Engine skill pack
- Crash recovery + resumable checkpoints (LC-18)
- Tamper-evident audit log with secret redaction (LC-19)
- Benchmark harness + KPI trend loop (LC-20)

Run with:
    python -m jarvis.jarvis_main
"""
from __future__ import annotations

import sys
import threading
import time

from rich.console import Console
from rich.panel import Panel

from jarvis.core.attack_engine import AttackEngine
from jarvis.core.audit_log import AuditLogger
from jarvis.core.benchmark import KPICollector
from jarvis.core.automation import DesktopAutomation, UnrealEngineSkill
from jarvis.core.boot import run_boot_sequence
from jarvis.core.brain import Brain
from jarvis.core.checkpoint import CheckpointManager
from jarvis.core.executor import Executor
from jarvis.core.expert_advisor import ExpertAdvisor
from jarvis.core.ghost_mode import GhostMode
from jarvis.core.hacking_teacher import HackingTeacher
from jarvis.core.stealth_engine import StealthExecutionEngine
from jarvis.core.stealth_ops import StealthOps
from jarvis.core.learner import Learner
from jarvis.core.memory import Memory
from jarvis.core.voice import VoiceEngine
from jarvis.core.weather import WeatherEngine
from jarvis.core.youtube_skill import YouTubeSkill

console = Console()

WAKE_WORD = "hey jarvis"


def _listen_for_command(
    voice: VoiceEngine,
    brain: Brain,
    ckpt: CheckpointManager,
    audit: AuditLogger,
    kpi: KPICollector,
) -> None:
    """Called on each wake-word detection. Records + executes user command."""
    console.print("\n[bold bright_green]  JARVIS ▶  [/][dim]Yes sir, I'm listening...[/]")
    voice.speak("Yes sir, I'm listening.")

    command_text = voice.listen_once(timeout=10, phrase_limit=20)
    if not command_text:
        msg = "I didn't catch that. Please try again."
        console.print(f"[bold bright_cyan]  JARVIS ▶  [/]{msg}")
        voice.speak(msg)
        return

    console.print(f"\n  [bold yellow]YOU ▶[/]  {command_text}\n")

    # ── audit: log user command ───────────────────────────────────────────────
    intent = brain._intent(command_text)
    audit.log_command(user_input=command_text, intent=intent, source="voice")

    t0 = time.perf_counter()
    result = brain.process(command_text)
    latency_ms = (time.perf_counter() - t0) * 1000

    # ── audit: log JARVIS response ───────────────────────────────────────────
    audit.log_response(output=result.spoken or "", intent=intent, success=result.success)

    # ── KPI: record command metric ───────────────────────────────────────────
    kpi.record_command(
        intent=intent,
        latency_ms=latency_ms,
        success=result.success,
        input_length=len(command_text),
        output_length=len(result.spoken or ""),
    )

    # ── checkpoint: track last exchange ───────────────────────────────────────
    ckpt.last_user_input = command_text
    ckpt.last_jarvis_response = result.spoken[:500] if result.spoken else ""
    ckpt.record_command()

    # ── display ───────────────────────────────────────────────────────────────
    if result.displayed:
        console.print(
            Panel(
                result.displayed,
                title="[cyan]JARVIS[/]",
                border_style="bright_blue",
            )
        )
    else:
        console.print(f"[bold bright_cyan]  JARVIS ▶  [/]{result.spoken}")

    # ── speak ─────────────────────────────────────────────────────────────────
    # Truncate very long answers for speech (display shows full version)
    speech_text = result.spoken
    if len(speech_text) > 500:
        speech_text = speech_text[:500] + "... See the full response on screen."
    voice.speak(speech_text)

    console.print()
    console.rule("[dim]Listening for 'Hey Jarvis'[/]")


def _sync_checkpoint(ckpt: CheckpointManager, brain: Brain, memory: Memory) -> None:
    """Keep checkpoint manager state in sync with live brain state."""
    ckpt.conversation_history = list(brain._conversation_history)
    ckpt.memory_count = memory.count()
    ckpt.model_name = brain._model


def main() -> None:
    console.print("[bold cyan]\nInitializing JARVIS...[/]\n")

    # ── Crash detection (BEFORE heavy init) ───────────────────────────────────
    ckpt = CheckpointManager()
    audit = AuditLogger(session_id=ckpt.session_id)
    kpi = KPICollector(session_id=ckpt.session_id)
    crashed, old_checkpoint = ckpt.detect_crash()

    if crashed and old_checkpoint:
        console.print(
            Panel(
                f"[bold yellow]Previous session crashed.[/]\n"
                f"  Session ID : {old_checkpoint.session_id}\n"
                f"  Uptime     : {int(old_checkpoint.uptime_seconds)}s\n"
                f"  Commands   : {old_checkpoint.commands_processed}\n"
                f"  History    : {len(old_checkpoint.conversation_history)} messages\n"
                f"  Last input : {old_checkpoint.last_user_input[:80] or '(none)'}\n\n"
                f"  [dim]Conversation history will be restored automatically.[/]",
                title="[bold red]⚠  CRASH RECOVERY[/]",
                border_style="red",
            )
        )
    elif crashed:
        console.print(
            "  [yellow]Previous session crashed but no checkpoint data found.[/]\n"
        )

    # ── Init all engines ──────────────────────────────────────────────────────
    memory = Memory()

    try:
        voice = VoiceEngine(wake_word=WAKE_WORD)
    except Exception as exc:
        console.print(f"[yellow]Voice init warning: {exc} — using silent mode.[/]")

        class _SilentVoice:
            def speak(self, t: str) -> None:
                console.print(f"  [dim](TTS) {t}[/]")
            def listen_once(self, **kw):
                return None
            def wait_for_wake_word(self):
                time.sleep(3)
            def start_continuous_wake_loop(self, on_wake, stop_event=None):
                pass

        voice = _SilentVoice()  # type: ignore[assignment]

    weather  = WeatherEngine()
    auto     = DesktopAutomation()
    unreal   = UnrealEngineSkill(auto)
    executor = Executor(memory)
    learner  = Learner(memory)
    youtube  = YouTubeSkill(memory)
    teacher  = HackingTeacher(memory)
    expert   = ExpertAdvisor(memory)
    attack   = AttackEngine(memory)    # autonomous recon + attack + auto-install
    stealth  = StealthOps(memory)      # adversary concealment & stealth ops
    stealth_engine = StealthExecutionEngine(memory)  # OPSEC execution layer
    ghost    = GhostMode(memory, voice)  # Ultimate visual+voice interactive hacking

    brain = Brain(
        weather=weather,
        automation=auto,
        unreal=unreal,
        memory=memory,
        learner=learner,
        executor=executor,
        youtube=youtube,
        teacher=teacher,
        expert=expert,
        attack=attack,
        stealth=stealth,
        stealth_engine=stealth_engine,
        ghost_mode=ghost,
    )

    # ── Restore from crash checkpoint ─────────────────────────────────────────
    if crashed and old_checkpoint and old_checkpoint.conversation_history:
        brain._conversation_history = list(old_checkpoint.conversation_history)
        console.print(
            f"  [green]✔ Restored {len(old_checkpoint.conversation_history)} "
            f"conversation messages from last session.[/]\n"
        )
        audit.log_crash_recovery(
            old_session=old_checkpoint.session_id,
            restored_msgs=len(old_checkpoint.conversation_history),
        )
        resume_msg = (
            "I detected an unclean shutdown. "
            "I've restored your previous conversation context. "
            "We can continue right where we left off."
        )
        voice.speak(resume_msg)

    # ── Start checkpoint engine + audit boot ──────────────────────────────────
    ckpt.wake_word = WAKE_WORD
    _sync_checkpoint(ckpt, brain, memory)
    ckpt.start()
    audit.log_boot(model=brain._model, memory_count=memory.count())
    console.print(
        f"  [dim green]Audit log armed — tamper-evident trail → "
        f"{audit.log_path.name}[/]"
    )
    console.print(
        f"  [dim green]KPI benchmark engine online — "
        f"tracking latency, intent accuracy, resource usage.[/]"
    )

    # ── Boot sequence ─────────────────────────────────────────────────────────
    run_boot_sequence(voice=voice, weather=weather)

    # ── Print knowledge base status ───────────────────────────────────────────
    count = memory.count()
    console.print(
        f"  [dim green]Knowledge base: {count} memory chunks available.[/]\n"
    )

    # ── Start wake-word loop ──────────────────────────────────────────────────
    stop_event = threading.Event()

    def _on_wake() -> None:
        _listen_for_command(voice, brain, ckpt, audit, kpi)
        _sync_checkpoint(ckpt, brain, memory)

    voice.start_continuous_wake_loop(on_wake=_on_wake, stop_event=stop_event)

    console.print(
        Panel(
            f"[bold bright_blue]JARVIS is fully operational.[/]\n\n"
            f"  Say [yellow]'{WAKE_WORD}'[/] to give a command.\n\n"
            f"  [dim]Example commands:[/]\n"
            f"  • 'Hey Jarvis, what's the weather?'\n"
            f"  • 'Hey Jarvis, give me an attack plan for a web application'\n"
            f"  • 'Hey Jarvis, how to get domain admin — decision tree'\n"
            f"  • 'Hey Jarvis, I'm stuck, the firewall is blocking everything'\n"
            f"  [dim]🥷 Stealth & Ghost Mode:[/]\n"
            f"  • 'Hey Jarvis, hack http://target.com'  [italic](Visual + Voice JARVIS experience)[/]\n"
            f"  • 'Hey Jarvis, stealth attack http://target.com'  [italic](Silent terminal mode)[/]\n"
            f"  • 'Hey Jarvis, ghost mode target.com'\n"
            f"  • 'Hey Jarvis, stealth status'\n"
            f"  • 'Hey Jarvis, go paranoid'\n"
            f"  • 'Hey Jarvis, show stealth modules'\n"
            f"  • 'Hey Jarvis, teach me rootkits'\n"
            f"  • 'Hey Jarvis, explain golden ticket'\n"
            f"  • 'Hey Jarvis, teach me air gap exfiltration'\n"
            f"  • 'Hey Jarvis, open YouTube and learn about Kerberoasting'\n"
            f"  • 'Hey Jarvis, write code to scan a network'\n\n"
            f"  Press [red]Ctrl+C[/] to shut down.",
            title="[bold red]JARVIS — FULL POWER CYBER EXPERT + GHOST MODE READY[/]",
            border_style="bright_red",
        )
    )

    try:
        while True:
            try:
                # Allow text input alongside voice wake word looping
                cmd = input().strip()
                if cmd:
                    console.print(f"\n  [bold yellow]YOU (via text) ▶[/]  {cmd}\n")
                    # Audit: log text command
                    text_intent = brain._intent(cmd)
                    audit.log_command(
                        user_input=cmd, intent=text_intent, source="text"
                    )

                    t0 = time.perf_counter()
                    res = brain.process(cmd)
                    latency_ms = (time.perf_counter() - t0) * 1000

                    # Audit: log response
                    audit.log_response(
                        output=res.spoken or "",
                        intent=text_intent,
                        success=res.success if res else True,
                    )

                    # KPI: record metric
                    kpi.record_command(
                        intent=text_intent,
                        latency_ms=latency_ms,
                        success=res.success if res else True,
                        input_length=len(cmd),
                        output_length=len(res.spoken or "") if res else 0,
                    )

                    # Track in checkpoint
                    ckpt.last_user_input = cmd
                    ckpt.last_jarvis_response = (
                        res.spoken[:500] if res and res.spoken else ""
                    )
                    ckpt.record_command()
                    _sync_checkpoint(ckpt, brain, memory)

                    if res and res.spoken:
                        console.print(f"\n[bold bright_cyan]JARVIS ▶[/]  {res.spoken}")
                        voice.speak(res.spoken)
            except Exception:
                time.sleep(1)
    except KeyboardInterrupt:
        stop_event.set()
        audit.log_shutdown(reason="user_ctrl_c")
        ckpt.shutdown()
        bye = "Goodbye sir. JARVIS shutting down. All systems powering off."
        console.print(f"\n[bold bright_cyan]JARVIS ▶[/]  {bye}")
        voice.speak(bye)
        sys.exit(0)


if __name__ == "__main__":
    main()
