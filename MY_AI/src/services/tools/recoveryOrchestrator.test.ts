import { describe, expect, test } from 'bun:test'

import { executeWithRecovery } from './recoveryOrchestrator.js'

describe('tool recovery orchestrator', () => {
  test('retries and succeeds before max retries', async () => {
    let calls = 0
    const result = await executeWithRecovery(
      async () => {
        calls += 1
        if (calls < 3) {
          throw new Error('transient')
        }
        return 'ok'
      },
      {
        maxRetries: 3,
        isRetriableError: () => true,
      },
    )

    expect(result.result).toBe('ok')
    expect(result.retriesUsed).toBe(2)
    expect(result.disposition).toBe('success')
  })

  test('degrades after retry exhaustion when fallback is available', async () => {
    const result = await executeWithRecovery(
      async () => {
        throw new Error('always fails')
      },
      {
        maxRetries: 1,
        isRetriableError: () => true,
        getDegradedResult: () => 'stale-result',
      },
    )

    expect(result.result).toBe('stale-result')
    expect(result.disposition).toBe('degraded')
  })

  test('escalates when non-retriable error is thrown', async () => {
    await expect(
      executeWithRecovery(
        async () => {
          throw new Error('fatal')
        },
        {
          maxRetries: 5,
          isRetriableError: () => false,
        },
      ),
    ).rejects.toThrow('fatal')
  })
})
