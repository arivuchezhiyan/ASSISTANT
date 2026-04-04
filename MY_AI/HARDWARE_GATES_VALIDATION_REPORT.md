# Hardware Gates Validation Report

Date: 2026-04-03 22.19.11

| Gate | Status | Details |
|---|---|---|
| Resource Governor tested: open 20 browser tabs -> AI stays stable | PASS (proxy) | Load/stability automation passed (system-control stress). |
| Resource Governor tested: open Unreal -> AI switches to MINIMAL mode within 10 seconds | PASS (proxy) | Mode transition tests passed (process-trigger path). |
| App launcher works for: VS Code, Unreal Engine, browser, file manager | PASS (partial-live) | alias mapping tests passed; sidecar health ok; file manager launch command accepted; VS Code launch command accepted; browser launch command accepted; Unreal launch still manual. |
| Qwen2.5-Coder produces valid Unreal C++ Actor class (compiles in UE) | SKIP (manual) | Module scaffolding passes, but real model+UE compile must be verified manually. |
| RAM never exceeds 14GB during normal use | SKIP (manual) | Requires live machine monitoring during normal workflow. |
| Voice STT accurately transcribes your accent in a quiet room | SKIP (manual) | Requires microphone + speaker-specific validation. |
| Context pruner caps at 4096 tokens and sessions stay stable over 1 hour | SKIP (manual) | Needs long-running live session soak. |
| Emergency mode tested: stress-ng RAM fill -> AI pauses gracefully | SKIP (manual) | Requires controlled RAM pressure tooling. |
| Validate emergency pause behavior under high RAM pressure | SKIP (manual) | Requires live RAM pressure with sidecar/governor active. |
| Validate stability on 1-hour continuous session | SKIP (manual) | Requires 1-hour interactive soak. |
