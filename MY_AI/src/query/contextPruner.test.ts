import { describe, expect, test } from 'bun:test'

import { getContextTokenCap, pruneMessagesToTokenCap } from './contextPruner.js'

describe('context pruner', () => {
  test('uses default token cap when env is unset', () => {
    const prev = process.env.MAX_CONTEXT_TOKENS
    delete process.env.MAX_CONTEXT_TOKENS
    expect(getContextTokenCap()).toBe(4096)
    process.env.MAX_CONTEXT_TOKENS = prev
  })

  test('prunes old messages when exceeding a tight cap', () => {
    const messages = [
      { role: 'user', text: 'a'.repeat(500) },
      { role: 'assistant', text: 'b'.repeat(500) },
      { role: 'user', text: 'c'.repeat(500) },
      { role: 'assistant', text: 'd'.repeat(500) },
    ]

    const result = pruneMessagesToTokenCap(messages, 120)
    expect(result.pruned).toBe(true)
    expect(result.messages.length).toBeLessThan(messages.length)
    expect(result.estimatedTokens).toBeLessThan(result.estimatedTokensBeforePrune)
  })

  test('signals compaction trigger on oversized context', () => {
    const prev = process.env.COMPACTOR_THRESHOLD_TOKENS
    process.env.COMPACTOR_THRESHOLD_TOKENS = '20'

    const messages = [{ role: 'user', text: 'x'.repeat(2000) }]
    const result = pruneMessagesToTokenCap(messages, 200)

    expect(result.shouldTriggerCompaction).toBe(true)
    process.env.COMPACTOR_THRESHOLD_TOKENS = prev
  })
})
