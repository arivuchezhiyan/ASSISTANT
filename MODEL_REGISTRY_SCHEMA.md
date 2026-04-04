# Model Registry Schema

## Registry Record
```json
{
  "modelId": "string",
  "family": "phi|qwen|other",
  "baseModel": "string",
  "adapterVersion": "string",
  "createdAt": "ISO-8601",
  "status": "candidate|active|rejected|rolled_back",
  "eval": {
    "safetyPass": true,
    "capabilityScore": 0,
    "improvementDelta": 0
  },
  "artifactPaths": ["string"],
  "notes": "string"
}
```

## Rules
- Single active model per route target.
- Candidates cannot become active unless all required eval gates pass.
- Rollback preserves prior active pointer and audit trace.

## Storage
- `data/model-registry/registry.json`
- `data/model-registry/history/*.json`
