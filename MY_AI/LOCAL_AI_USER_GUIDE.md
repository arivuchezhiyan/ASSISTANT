# Local AI User Guide

## 1) Quick Start

From project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-ai.ps1
```

Integrated orchestrator mode (no browser UI):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/boot-jarvis.ps1
```

Web UI mode (optional, opens browser):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/boot-jarvis.ps1 -EnableWebUi
```

Health-only check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-local-ai.ps1 -CheckOnly
```

## 2) What This Starts

- Python sidecar on `http://127.0.0.1:7823`
- Bun CLI app (`src/main.tsx`)

Optional voice glass UI (manual):

```powershell
python -m http.server 8091 -d "C:\Users\arivu\Downloads\AI_CODE\MY_AI\web-ui"
```

Open:

http://127.0.0.1:8091/index.html

## 3) Core Commands You Can Use

- `/voice`: toggle voice mode
- `/open-app <vscode|unreal|browser|files|path> [args...]`: launch apps via sidecar
- `/clipboard read`: read clipboard text
- `/clipboard write <text>`: write clipboard text
- `/window-focus <window title>`: focus a window by title

## 4) Main Features Implemented

- Resource governor and mode switching with model swap stability checks
- Intent and complexity routing for local model selection
- Context pruning with hard token cap behavior (`MAX_CONTEXT_TOKENS`, default 4096)
- Tool reliability fabric:
  - parallel execution limits
  - tool result cache with TTL
  - retry/degrade/escalate recovery orchestration
  - permission bypass guard + standardized error envelopes
- Memory stack:
  - vector store adapter
  - retrieval pipeline + validation
  - memory extraction + governance (pin/forget/redact/export)
- Voice/system-control foundation:
  - sidecar STT endpoint contract
  - sidecar TTS endpoint contract
  - wake hotkey routing utilities
  - app/window/clipboard command integrations
- Unreal helper stack:
  - project detector
  - build runner
  - log parser + analyzer
  - fix suggester
  - module scaffold generator
  - end-to-end build-error fix loop test
- Reliability/ops:
  - policy abuse suite
  - crash checkpoint/resume primitives
  - benchmark KPI harness
  - go-live smoke/rollback runbook
  - automated hardware-gate runner and reports

## 5) Validation Artifacts

- Automated/proxy + partial live hardware report: `HARDWARE_GATES_VALIDATION_REPORT.md`
- Full readiness smoke report: `DAILY_USE_READINESS_REPORT.md`
- Go-live and rollback runbook: `GO_LIVE_SMOKE_AND_ROLLBACK_RUNBOOK.md`
- Manual gate checklist: `scripts/validation/MANUAL_HARDWARE_GATES.md`
- Soak evidence script: `scripts/validation/run-soak-monitor.ps1`
- Voice UI guide: `web-ui/README.md`

## 6) Current Practical Limits

- Some gates are intentionally manual (accent STT quality, 1-hour soak, emergency RAM-pressure behavior, real Unreal compile with generated actor).
- `faster-whisper` full dependency install currently fails on Python 3.13 in this environment due `av` wheel build path; sidecar core features still run with minimal runtime dependencies.

## 7) Recommended Next Steps

One-command readiness cycle (starts sidecar, runs soak, analyzes, runs hardware gates):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/run-readiness-cycle.ps1 -DurationMinutes 60 -IntervalSeconds 5 -RamLimitGb 14
```

Run final validation in background and monitor progress:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/start-final-validation.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/check-final-validation.ps1
```

Capture manual gate outcomes and apply to checklist:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/capture-manual-gates.ps1 -VoiceSttAccent pass -QwenActorCompile skip -ContextPruner1Hour skip -EmergencyStress skip -EmergencyHighRam skip -Stability1Hour skip -Notes "Voice tested in quiet room"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/apply-manual-gates-from-capture.ps1 -CapturePath ./MANUAL_GATES_CAPTURE.md -BlueprintPath ./MY_AI_HARDWARE_OPTIMIZED_BLUEPRINT.md
```

Optional per-gate evidence capture scripts:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/capture-voice-accent-test.ps1 -TotalPhrases 10 -CorrectPhrases 9 -OutputPath ./VOICE_ACCENT_TEST_REPORT.md
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/capture-unreal-compile-test.ps1 -CompileVerdict pass -ActorName VehicleSpawnManager -OutputPath ./UNREAL_COMPILE_TEST_REPORT.md
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/capture-emergency-ram-test.ps1 -EmergencyPause pass -HighRamBehavior pass -OutputPath ./EMERGENCY_RAM_TEST_REPORT.md
```

1. Run a 60-minute soak capture:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/run-soak-monitor.ps1 -DurationMinutes 60 -IntervalSeconds 5 -OutputPath ./SOAK_MONITOR_REPORT.csv
```

Analyze soak gate verdicts:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/analyze-soak-report.ps1 -InputCsv ./SOAK_MONITOR_REPORT.csv -OutputMarkdown ./SOAK_MONITOR_ANALYSIS.md -RamLimitGb 14 -MinDurationMinutes 60
```

2. Run hardware gates again after soak:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validation/run-hardware-gates.ps1
```

3. Complete remaining manual checks in `scripts/validation/MANUAL_HARDWARE_GATES.md`.
