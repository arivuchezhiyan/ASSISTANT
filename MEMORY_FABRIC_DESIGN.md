# Memory Fabric Design

## Tiers
1. Session memory: current conversation signals.
2. Project memory: workspace-specific durable context.
3. Personal memory: user-level preferences and patterns.
4. Feedback memory: model-improvement signals and training traces.

## Retrieval Strategy
- Scope-aware candidate selection.
- Ranking by relevance, recency, and scope compatibility.
- Hard cap pruning before model calls.

## Writeback Rules
- Extract at turn completion.
- Tag each record with source and scope.
- Apply privacy filter for feedback/training channels.

## Acceptance
- Retrieval precision improves benchmark baseline.
- Restart-safe persistence.
- No unbounded growth without retention policy.
