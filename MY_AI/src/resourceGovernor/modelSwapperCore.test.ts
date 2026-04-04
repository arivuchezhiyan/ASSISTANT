import { describe, expect, test } from 'bun:test'

import {
  applyModeToSwapperState,
  createModelSwapperState,
} from './modelSwapperCore.js'

describe('resource governor model swapper core', () => {
  test('applies mode transition and keeps model state stable on repeated mode', () => {
    process.env.GOVERNOR_MODEL_FULL = 'full-model'
    process.env.GOVERNOR_MODEL_MINIMAL = 'tiny-model'

    const state = createModelSwapperState()

    const full = applyModeToSwapperState(state, 'full')
    expect(full.model).toBe('full-model')
    expect(full.changed).toBe(true)

    const minimal = applyModeToSwapperState(state, 'minimal')
    expect(minimal.model).toBe('tiny-model')
    expect(minimal.changed).toBe(true)
    expect(process.env.RESOURCE_GOVERNOR_MODE).toBe('minimal')

    const repeat = applyModeToSwapperState(state, 'minimal')
    expect(repeat.model).toBe('tiny-model')
    expect(repeat.changed).toBe(false)
  })
})
