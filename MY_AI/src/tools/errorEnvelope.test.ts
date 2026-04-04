import { describe, expect, test } from 'bun:test'

import {
  createToolErrorEnvelope,
  renderToolErrorEnvelope,
} from './errorEnvelope.js'

describe('tool error envelope', () => {
  test('creates normalized envelope from Error input', () => {
    const envelope = createToolErrorEnvelope({
      error: new Error('network timeout'),
      attempts: 2,
      recoveryPath: 'retry',
    })

    expect(envelope.error).toBe('network timeout')
    expect(envelope.attempts).toBe(2)
    expect(envelope.recoveryPath).toBe('retry')
  })

  test('renders canonical multiline payload', () => {
    const text = renderToolErrorEnvelope(
      createToolErrorEnvelope({
        error: 'failed',
        attempts: 1,
        recoveryPath: 'escalate',
      }),
    )

    expect(text).toContain('[TOOL_ERROR] failed')
    expect(text).toContain('[RECOVERY_PATH] escalate')
    expect(text).toContain('[RECOVERY_HINT]')
    expect(text).toContain('[ESCALATION_PATH]')
    expect(text).toContain('[ATTEMPTS] 1')
  })
})
