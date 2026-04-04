# Go-Live Smoke and Rollback Runbook

## Purpose

This runbook defines a repeatable release gate for MY_AI and a low-risk rollback path.
Use it before every local production rollout.

## Preconditions

- Python sidecar dependencies installed from `python-sidecar/requirements.txt`.
- Bun dependencies installed.
- No failing focused tests in touched subsystems.
- Runtime checkpoint directory writable: `data/runtime-checkpoints/`.

## Smoke Test Matrix

Run these from project root.

1. Voice adapters and routing

```powershell
bun test src/voice/sttAdapter.test.ts src/voice/ttsAdapter.test.ts src/voice/voiceRouting.test.ts
```

Expected:
- All tests pass.

2. System-control command path

```powershell
bun test src/services/systemControl/sidecarControl.test.ts src/services/systemControl/sidecarControl.load.test.ts src/commands/open-app/open-app.test.ts
```

Expected:
- All tests pass.
- Load test stays within configured thresholds.

3. Unreal connector core

```powershell
bun test src/services/unreal/projectDetector.test.ts src/services/unreal/buildRunner.test.ts src/services/unreal/logParser.test.ts src/services/unreal/fixSuggester.test.ts src/services/unreal/moduleScaffold.test.ts src/services/unreal/buildFixLoop.test.ts
```

Expected:
- All tests pass.

4. Reliability and policy

```powershell
bun test src/security/policyAbuse.test.ts src/services/runtime/crashCheckpoint.test.ts src/benchmarks/commandKpiHarness.test.ts
```

Expected:
- All tests pass.

## Manual Sanity Checks (Windows)

1. Start sidecar

```powershell
python python-sidecar/main.py
```

2. In a second terminal, verify health

```powershell
curl http://127.0.0.1:7823/health
```

Expected:
- `{"status":"ok"}`

3. CLI command checks

- `/open-app vscode .`
- `/clipboard write hello`
- `/clipboard read`
- `/window-focus Visual Studio Code`

Expected:
- Commands return success text and do not hang.

## Go/No-Go Decision

Go when all are true:
- Smoke test matrix passed.
- Manual sanity checks passed.
- No new high-severity regressions in changed modules.

No-Go when any are true:
- Any smoke test fails.
- Sidecar health or command path is unstable.
- Policy/abuse suite fails.

## Rollback Plan

1. Stop running sidecar and CLI sessions.
2. Revert to last known-good git commit/tag.
3. Remove newly generated runtime files only:
   - `data/runtime-checkpoints/*`
   - `data/memory-export-*.json`
4. Re-run smoke tests on the rollback commit.
5. Restart sidecar and CLI.

## Incident Notes Template

Record after rollback:
- Commit hash rolled back from/to
- Triggered failing step
- User-visible impact
- Proposed fix and owner
- Next verification window
