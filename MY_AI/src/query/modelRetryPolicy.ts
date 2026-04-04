type ModelRetryPolicyInput = {
  requestedFallbackModel?: string
  routedFallbackModel?: string
}

export type ModelRetryPolicy = {
  fallbackModel?: string
  maxFallbackAttempts: number
  enabled: boolean
}

export function resolveModelRetryPolicy(
  input: ModelRetryPolicyInput,
): ModelRetryPolicy {
  const fallbackModel =
    input.requestedFallbackModel ??
    input.routedFallbackModel ??
    process.env.FALLBACK_MODEL

  const rawAttempts = process.env.MODEL_FALLBACK_MAX_ATTEMPTS
  const parsedAttempts = rawAttempts ? Number(rawAttempts) : NaN
  const maxFallbackAttempts =
    Number.isFinite(parsedAttempts) && parsedAttempts > 0
      ? Math.floor(parsedAttempts)
      : 1

  const enabled = Boolean(fallbackModel)

  return {
    fallbackModel,
    maxFallbackAttempts,
    enabled,
  }
}
