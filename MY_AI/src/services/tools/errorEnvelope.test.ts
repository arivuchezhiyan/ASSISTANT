import { describe, expect, test } from 'bun:test'

import { buildToolErrorEnvelope, getRollbackHint } from './errorEnvelope.js'

describe('tool error envelope', () => {
  test('builds escaped xml envelope with rollback hint', () => {
    const env = buildToolErrorEnvelope({
      toolName: 'FileEdit',
      code: 'InputValidationError',
      message: 'bad <value> & invalid',
    })

    expect(env.xml.includes('<tool_use_error>')).toBe(true)
    expect(env.xml.includes('&lt;value&gt;')).toBe(true)
    expect(env.text.includes('Rollback hint:')).toBe(true)
  })

  test('returns tool-specific rollback hints', () => {
    expect(getRollbackHint('FileWrite')).toContain('restore previous file content')
    expect(getRollbackHint('Bash')).toContain('safe inverse command')
  })
})
