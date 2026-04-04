export type RecoveryPath = 'retry' | 'degrade' | 'escalate'

export type ToolErrorEnvelope = {
  error: string
  recoveryHint: string
  escalationPath: string
  recoveryPath: RecoveryPath
  attempts: number
}

export function createToolErrorEnvelope(input: {
  error: unknown
  attempts: number
  recoveryPath: RecoveryPath
  recoveryHint?: string
  escalationPath?: string
}): ToolErrorEnvelope {
  const message =
    input.error instanceof Error
      ? input.error.message
      : typeof input.error === 'string'
        ? input.error
        : 'unknown tool error'

  return {
    error: message,
    recoveryHint:
      input.recoveryHint ??
      'Retry if transient; otherwise degrade to a safer fallback.',
    escalationPath:
      input.escalationPath ??
      'Escalate to user approval or manual intervention workflow.',
    recoveryPath: input.recoveryPath,
    attempts: Math.max(1, input.attempts),
  }
}

export function renderToolErrorEnvelope(envelope: ToolErrorEnvelope): string {
  return [
    `[TOOL_ERROR] ${envelope.error}`,
    `[RECOVERY_PATH] ${envelope.recoveryPath}`,
    `[RECOVERY_HINT] ${envelope.recoveryHint}`,
    `[ESCALATION_PATH] ${envelope.escalationPath}`,
    `[ATTEMPTS] ${envelope.attempts}`,
  ].join('\n')
}
