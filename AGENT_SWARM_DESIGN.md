# Agent Swarm Design

## Goal
Coordinate specialized agents with bounded resource use and deterministic recovery.

## Roles
- Coordinator: planning, fan-out, aggregation.
- Worker: isolated task execution.
- Verifier: checks outputs against acceptance criteria.

## Execution Model
1. Coordinator builds task graph.
2. Workers execute independent nodes with governor caps.
3. Verifier validates each node output.
4. Coordinator merges results and issues final action plan.

## Safety Controls
- Max concurrent workers tied to resource governor mode.
- Explicit tool permission scope per worker.
- Failure isolation and retry/degrade/escalate policy reuse.

## Acceptance
- Stable execution under low-memory mode.
- No cross-worker state corruption.
- Deterministic replay for failed runs.
