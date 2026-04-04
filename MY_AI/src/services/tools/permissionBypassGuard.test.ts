import { describe, expect, test } from 'bun:test'

import {
  canUseCachedResult,
  canUseDegradedFallback,
} from './permissionBypassGuard.js'

describe('permission bypass guard', () => {
  test('allows cache/degrade only when permission behavior is allow', () => {
    expect(canUseCachedResult('allow')).toBe(true)
    expect(canUseDegradedFallback('allow')).toBe(true)

    expect(canUseCachedResult('deny')).toBe(false)
    expect(canUseCachedResult('ask')).toBe(false)

    expect(canUseDegradedFallback('deny')).toBe(false)
    expect(canUseDegradedFallback('ask')).toBe(false)
  })
})
