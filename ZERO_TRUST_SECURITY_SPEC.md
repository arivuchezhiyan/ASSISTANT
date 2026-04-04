# Zero Trust Security Spec

## Principles
- Deny-by-default for tools and network access.
- Least privilege per tool invocation.
- Explicit allow rules for sensitive operations.
- Full audit trace for privileged actions.

## Controls
- Permission engine with allow/ask/deny rules.
- Domain allowlist for web fetch and retrieval tooling.
- Secret redaction before persistence.
- Tamper-evident logs for command and tool actions.

## Threat Model
- Prompt injection via external content
- Secret exfiltration through tool misuse
- Privilege escalation across sessions
- Replay or hidden side effects in unsafe commands

## Acceptance
- Policy regression suite catches unsafe behavior.
- No privileged action executes without explicit policy path.
- Audit records available for incident review.
