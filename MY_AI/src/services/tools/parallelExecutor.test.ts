import { describe, expect, test } from 'bun:test'

import { getGovernorAwareParallelLimit } from './parallelExecutor.js'

describe('governor-aware parallel executor limit', () => {
  test('uses configured base in full mode', () => {
    process.env.RESOURCE_GOVERNOR_MODE = 'full'
    expect(getGovernorAwareParallelLimit(6)).toBe(6)
  })

  test('caps to 2 in reduced mode', () => {
    process.env.RESOURCE_GOVERNOR_MODE = 'reduced'
    expect(getGovernorAwareParallelLimit(10)).toBe(2)
  })

  test('caps to 1 in minimal mode', () => {
    process.env.RESOURCE_GOVERNOR_MODE = 'minimal'
    expect(getGovernorAwareParallelLimit(10)).toBe(1)
  })

  test('forces 1 in emergency mode', () => {
    process.env.RESOURCE_GOVERNOR_MODE = 'emergency'
    expect(getGovernorAwareParallelLimit(10)).toBe(1)
  })
})
