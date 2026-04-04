import { describe, expect, test } from 'bun:test'

import { resolveModelRetryPolicy } from './modelRetryPolicy.js'

describe('model retry policy', () => {
  test('prefers explicitly requested fallback model', () => {
    const policy = resolveModelRetryPolicy({
      requestedFallbackModel: 'explicit-fallback',
      routedFallbackModel: 'routed-fallback',
    })

    expect(policy.fallbackModel).toBe('explicit-fallback')
    expect(policy.enabled).toBe(true)
  })

  test('falls back to routed model when request is absent', () => {
    const policy = resolveModelRetryPolicy({
      routedFallbackModel: 'routed-fallback',
    })

    expect(policy.fallbackModel).toBe('routed-fallback')
    expect(policy.enabled).toBe(true)
  })

  test('disables fallback when no fallback model exists', () => {
    const prev = process.env.FALLBACK_MODEL
    delete process.env.FALLBACK_MODEL

    const policy = resolveModelRetryPolicy({})
    expect(policy.enabled).toBe(false)

    process.env.FALLBACK_MODEL = prev
  })
})
