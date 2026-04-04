type PruneResult<T> = {
  messages: T[]
  estimatedTokens: number
  estimatedTokensBeforePrune: number
  pruned: boolean
  shouldTriggerCompaction: boolean
}

function roughTokenCountEstimation(content: string): number {
  // Keep the pruner hot path independent of API/token modules.
  return Math.max(1, Math.round(content.length / 4))
}

function estimateMessageTokens(message: unknown): number {
  try {
    return Math.max(1, roughTokenCountEstimation(JSON.stringify(message)))
  } catch {
    return 1
  }
}

export function pruneMessagesToTokenCap<T>(
  messages: T[],
  maxTokens: number,
): PruneResult<T> {
  if (messages.length === 0 || maxTokens <= 0) {
    return {
      messages,
      estimatedTokens: 0,
      estimatedTokensBeforePrune: 0,
      pruned: false,
      shouldTriggerCompaction: false,
    }
  }

  const compactionThreshold = getCompactionThreshold(maxTokens)
  let estimatedBeforePrune = 0
  for (const msg of messages) {
    estimatedBeforePrune += estimateMessageTokens(msg)
  }

  let total = 0
  const kept: T[] = []

  // Keep newest context first until cap is reached.
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i]
    const cost = estimateMessageTokens(msg)
    if (kept.length > 0 && total + cost > maxTokens) {
      continue
    }
    kept.push(msg)
    total += cost
  }

  const prunedMessages = kept.reverse()
  return {
    messages: prunedMessages,
    estimatedTokens: total,
    estimatedTokensBeforePrune: estimatedBeforePrune,
    pruned: prunedMessages.length !== messages.length,
    shouldTriggerCompaction: estimatedBeforePrune >= compactionThreshold,
  }
}

export function getContextTokenCap(): number {
  const raw = process.env.MAX_CONTEXT_TOKENS
  const parsed = raw ? Number(raw) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 4096
  }
  return Math.floor(parsed)
}

function getCompactionThreshold(defaultFromCap: number): number {
  const raw = process.env.COMPACTOR_THRESHOLD_TOKENS
  const parsed = raw ? Number(raw) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.floor(defaultFromCap * 0.75)
  }
  return Math.floor(parsed)
}
