# Training Data Curator Spec

## Objective
Convert raw feedback events into high-quality training-ready records.

## Curator Stages
1. Validate event schema and drop malformed records.
2. Deduplicate by semantic hash and near-time duplicates.
3. Label outcome classes: success, recoverable_error, hard_failure.
4. Score sample quality using signal completeness and clarity.
5. Route low-confidence records to uncertain queue.

## Labels
- `intent_class`: system, code, unreal, analysis, generic
- `quality_score`: 0.0-1.0
- `safety_flag`: clean, needs_review
- `training_bucket`: instruction, correction, failure_recovery

## Storage Layout
- `training_vault/raw/*.jsonl`
- `training_vault/curated/*.jsonl`
- `training_vault/uncertain/pending.jsonl`

## Acceptance
- Correct labels on 50-sample validation set.
- >= 95% schema-valid curated output.
- No detected unredacted secrets in curated files.
