import { describe, expect, test } from 'bun:test'

import { resolveLocalModelRoute } from './localModelRouter.js'

describe('local model router', () => {
  test('routes code/high complexity to code model', () => {
    process.env.DEFAULT_MAIN_MODEL = 'default-model'
    process.env.CODE_MODEL = 'code-model'
    process.env.FALLBACK_MODEL = 'tiny-model'

    const route = resolveLocalModelRoute({
      intent: { category: 'code', complexity: 'high' },
      complexity: { level: 'high', score: 9 },
      governorMode: 'full',
    })

    expect(route.primaryModel).toBe('code-model')
    expect(route.routeCode).toBe(2)
  })

  test('routes minimal mode to tiny model', () => {
    process.env.DEFAULT_MAIN_MODEL = 'default-model'
    process.env.FALLBACK_MODEL = 'tiny-model'

    const route = resolveLocalModelRoute({
      intent: { category: 'chat', complexity: 'low' },
      complexity: { level: 'low', score: 1 },
      governorMode: 'minimal',
    })

    expect(route.primaryModel).toBe('tiny-model')
    expect(route.routeCode).toBe(1)
  })

  test('routes chat/default to default model', () => {
    process.env.DEFAULT_MAIN_MODEL = 'default-model'
    process.env.FALLBACK_MODEL = 'tiny-model'

    const route = resolveLocalModelRoute({
      intent: { category: 'chat', complexity: 'low' },
      complexity: { level: 'low', score: 2 },
      governorMode: 'full',
    })

    expect(route.primaryModel).toBe('default-model')
    expect(route.routeCode).toBe(3)
  })
})
