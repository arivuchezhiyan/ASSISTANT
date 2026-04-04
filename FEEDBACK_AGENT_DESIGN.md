# Feedback Agent Design

## Goal
Capture structured turn-level signals from runtime paths and stage them for privacy-safe curation and model improvement.

## Inputs
- Query turn result (success/error)
- Last user text and assistant text
- Runtime metadata (session id, timestamp)

## Processing Pipeline
1. Ingestion: capture turn outcome and payload.
2. Privacy filter: redact email, bearer tokens, API keys, passwords.
3. Persistence: append JSONL event to local training vault.
4. Export: provide bounded readers for curator and evaluation layers.

## Event Schema
```json
{
  "id": "string",
  "sessionId": "string",
  "timestamp": "ISO-8601",
  "outcome": "success|error",
  "userText": "string",
  "assistantText": "string",
  "privacy": { "redactionCount": 0 },
  "source": "query-engine"
}
```

## Reliability Rules
- Ingestion failures must never fail primary request execution.
- Redaction runs before disk write.
- JSONL append is atomic per event.

## Acceptance
- 100% events parse as schema-valid JSON.
- Privacy redaction applied to known secret patterns.
- Runtime overhead under 5ms median per event on laptop profile.
