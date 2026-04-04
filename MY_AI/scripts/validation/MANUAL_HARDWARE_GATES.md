# Manual Hardware Acceptance Gates

Run these on your laptop to complete the remaining hardware-dependent checks.

## Governor Stress

1. Open 20 browser tabs and keep MY_AI active.
2. Confirm no crash and responsive CLI.
3. Record peak RAM usage.

Expected:
- Stable process.
- RAM <= 14 GB under normal use target.

## Unreal Minimal-Mode Switch

1. Start MY_AI.
2. Launch Unreal Editor.
3. Observe mode indicator or telemetry.

Expected:
- Resource governor enters MINIMAL mode within 10 seconds.

## App Launcher Real-World Validation

Run commands:
- /open-app vscode .
- /open-app unreal
- /open-app browser https://www.unrealengine.com
- /open-app files

Expected:
- Each target app/window opens successfully.

## Voice Accuracy Check

1. Enable voice mode.
2. Dictate 10 short phrases in a quiet room.
3. Count accurate transcriptions.

Expected:
- >= 90% phrase-level accuracy for your accent.

## Emergency Pause

1. Simulate high RAM pressure.
2. Confirm governor enters emergency pause.
3. Close pressure source and verify recovery.

Expected:
- Graceful pause and resume without crash.

## 1-Hour Stability Soak

1. Keep session active for 1 hour with mixed tasks.
2. Watch for memory growth, tool failures, and mode transitions.

Expected:
- No crash, no runaway memory, no corrupted context.
