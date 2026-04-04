# LoRA Pipeline Runbook

## Scope
Local laptop fine-tuning flow for Phi/Qwen adapters using curated training data.

## Prerequisites
- Curated dataset in `training_vault/curated/`
- Compatible base model and tokenizer
- Free disk space >= 20 GB

## Run Steps
1. Export curator output to train/val JSONL splits.
2. Start LoRA training with profile config (phi or qwen).
3. Monitor loss, VRAM, and checkpoint intervals.
4. Run post-train eval suite.
5. Register candidate in model registry.
6. Promote only if all gates pass.

## Failure Handling
- OOM: reduce batch size, increase grad accumulation.
- Divergence: lower LR and restart from clean checkpoint.
- Eval regression: reject candidate and keep current production model.

## Acceptance
- Phi run completes < 20 min target.
- Qwen run completes < 45 min target.
- Safety and capability eval gates pass before promotion.
