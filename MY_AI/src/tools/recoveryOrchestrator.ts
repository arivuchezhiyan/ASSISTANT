import {
  createToolErrorEnvelope,
  type ToolErrorEnvelope,
} from './errorEnvelope.js'

export type ToolRecoveryPolicy<T> = {
  maxAttempts?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
  degrade?: () => Promise<T> | T
  recoveryHint?: string
  escalationPath?: string
}

export type ToolRecoveryResult<T> =
  | {
      ok: true
      value: T
      attempts: number
      recoveryPath: 'retry' | 'degrade'
    }
  | {
      ok: false
      attempts: number
      envelope: ToolErrorEnvelope
    }

export async function executeWithRecovery<T>(
  run: () => Promise<T>,
  policy?: ToolRecoveryPolicy<T>,
): Promise<ToolRecoveryResult<T>> {
  const maxAttempts = Math.max(1, policy?.maxAttempts ?? 1)
  const shouldRetry =
    policy?.shouldRetry ??
    ((error: unknown, attempt: number) => {
      if (attempt >= maxAttempts) return false
      const msg =
        error instanceof Error
          ? error.message.toLowerCase()
          : String(error).toLowerCase()
      return /timeout|temporar|network|busy|rate limit/.test(msg)
    })

  let attempts = 0
  let lastError: unknown = 'unknown tool error'

  while (attempts < maxAttempts) {
    attempts += 1
    try {
      const value = await run()
      return {
        ok: true,
        value,
        attempts,
        recoveryPath: attempts > 1 ? 'retry' : 'degrade',
      }
    } catch (error) {
      lastError = error
      if (!shouldRetry(error, attempts)) {
        break
      }
    }
  }

  if (policy?.degrade) {
    try {
      const fallback = await policy.degrade()
      return {
        ok: true,
        value: fallback,
        attempts,
        recoveryPath: 'degrade',
      }
    } catch (degradeError) {
      lastError = degradeError
    }
  }

  return {
    ok: false,
    attempts,
    envelope: createToolErrorEnvelope({
      error: lastError,
      attempts,
      recoveryPath: 'escalate',
      recoveryHint: policy?.recoveryHint,
      escalationPath: policy?.escalationPath,
    }),
  }
}
