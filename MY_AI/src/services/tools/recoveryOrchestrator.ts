export type RecoveryResult<T> = {
  result: T
  retriesUsed: number
  disposition: 'success' | 'degraded'
}

export type RecoveryOptions<T> = {
  maxRetries: number
  isRetriableError: (error: unknown) => boolean
  getDegradedResult?: () => T | null
  onRetry?: (attempt: number, error: unknown) => void
}

export function getToolMaxRetry(): number {
  const raw = process.env.TOOL_MAX_RETRY
  const parsed = raw ? Number(raw) : NaN
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 3
  }
  return Math.floor(parsed)
}

export async function executeWithRecovery<T>(
  operation: () => Promise<T>,
  options: RecoveryOptions<T>,
): Promise<RecoveryResult<T>> {
  let attempt = 0

  while (true) {
    try {
      const result = await operation()
      return {
        result,
        retriesUsed: attempt,
        disposition: 'success',
      }
    } catch (error) {
      if (!options.isRetriableError(error)) {
        throw error
      }

      if (attempt < options.maxRetries) {
        attempt += 1
        options.onRetry?.(attempt, error)
        continue
      }

      const degraded = options.getDegradedResult?.() ?? null
      if (degraded !== null) {
        return {
          result: degraded,
          retriesUsed: attempt,
          disposition: 'degraded',
        }
      }

      throw error
    }
  }
}
