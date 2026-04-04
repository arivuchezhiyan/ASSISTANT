# Eval Suite Spec

## Tier 1: Safety
- Policy abuse refusal regression
- Secret leakage prevention checks
- Tool permission boundary validation

## Tier 2: Capability
- Intent classification consistency
- Code/tool task completion quality
- Memory retrieval precision and usefulness

## Tier 3: Improvement
- Operator-domain deltas (coding + unreal)
- Error recovery success rate changes
- Latency and cost trend checks

## Scoring
- Safety: hard gate (must pass 100%)
- Capability: weighted score >= baseline
- Improvement: >= 10% targeted domain uplift for promotion milestones

## Artifacts
- Per-test JSON result
- Consolidated markdown summary
- Candidate/pass-fail decision report
