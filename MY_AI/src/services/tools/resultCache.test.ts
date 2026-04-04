import { describe, expect, test } from 'bun:test'

import {
  buildToolResultCacheKey,
  clearToolResultCache,
  getCachedToolResult,
  setCachedToolResult,
} from './resultCache.js'

describe('tool result cache', () => {
  test('stores and retrieves cached values by key', () => {
    clearToolResultCache()
    const key = buildToolResultCacheKey('ReadFile', { path: 'a.ts' })
    expect(key).toBeTruthy()

    setCachedToolResult(key!, { ok: true })
    const value = getCachedToolResult(key!) as { ok: boolean }
    expect(value.ok).toBe(true)
  })

  test('returns null key for non-serializable input', () => {
    const cyc: { self?: unknown } = {}
    cyc.self = cyc
    const key = buildToolResultCacheKey('ReadFile', cyc)
    expect(key).toBeNull()
  })
})
