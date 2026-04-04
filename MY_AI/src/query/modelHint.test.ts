import { describe, expect, test } from 'bun:test'

import { getModelHint } from './modelHint.js'

describe('model hint', () => {
  test('returns tiny model for low-complexity system intent', () => {
    process.env.DEFAULT_MAIN_MODEL = 'phi-main'
    process.env.FALLBACK_MODEL = 'tiny'

    const hint = getModelHint(
      { category: 'system', complexity: 'low' },
      { level: 'low', score: 1 },
    )

    expect(hint).toBe('tiny')
  })

  test('returns code model for high-complexity code intent', () => {
    process.env.DEFAULT_MAIN_MODEL = 'phi-main'
    process.env.CODE_MODEL = 'qwen-code'

    const hint = getModelHint(
      { category: 'code', complexity: 'high' },
      { level: 'high', score: 9 },
    )

    expect(hint).toBe('qwen-code')
  })

  test('falls back to default model for general chat', () => {
    process.env.DEFAULT_MAIN_MODEL = 'phi-main'
    delete process.env.CODE_MODEL

    const hint = getModelHint(
      { category: 'chat', complexity: 'low' },
      { level: 'low', score: 1 },
    )

    expect(hint).toBe('phi-main')
  })
})
