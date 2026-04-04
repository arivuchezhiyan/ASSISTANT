import { describe, expect, test } from 'bun:test'

import { ToolResultCache } from './resultCache.js'

describe('tool result cache', () => {
  test('stores and retrieves values within ttl', () => {
    const cache = new ToolResultCache<string>({ defaultTtlMs: 1000 })
    cache.set('k1', 'v1')
    expect(cache.get('k1')).toBe('v1')
    expect(cache.has('k1')).toBe(true)
  })

  test('expires values after ttl', async () => {
    const cache = new ToolResultCache<string>({ defaultTtlMs: 10 })
    cache.set('k1', 'v1')
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(cache.get('k1')).toBeUndefined()
  })

  test('evicts oldest entry when max size is reached', () => {
    const cache = new ToolResultCache<number>({ defaultTtlMs: 1000, maxEntries: 2 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })
})
