import { describe, expect, test } from 'bun:test'

import { executeWithRecovery } from './recoveryOrchestrator.js'

describe('recovery orchestrator', () => {
  test('retries transient failure and succeeds', async () => {
    let attempts = 0
    const result = await executeWithRecovery(
      async () => {
        attempts += 1
        if (attempts < 2) {
          throw new Error('temporary network timeout')
        }
        return 'ok'
      },
      { maxAttempts: 2 },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('ok')
      expect(result.attempts).toBe(2)
      expect(result.recoveryPath).toBe('retry')
    }
  })

  test('degrades when primary run fails', async () => {
    const result = await executeWithRecovery(
      async () => {
        throw new Error('non-transient failure')
      },
      {
        maxAttempts: 1,
        degrade: async () => 'fallback',
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('fallback')
      expect(result.recoveryPath).toBe('degrade')
    }
  })

  test('escalates with normalized envelope when all paths fail', async () => {
    const result = await executeWithRecovery(
      async () => {
        throw new Error('fatal error')
      },
      {
        maxAttempts: 1,
        degrade: async () => {
          throw new Error('degrade failed')
        },
      },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.envelope.recoveryPath).toBe('escalate')
      expect(result.envelope.error).toContain('degrade failed')
    }
  })
})
