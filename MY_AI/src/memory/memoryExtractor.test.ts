import { describe, expect, test } from 'bun:test'

import { extractAndStoreTurnMemory } from './memoryExtractor.js'
import { DiskVectorStoreAdapter } from './vectorStore.js'

describe('memory extractor', () => {
  test('stores last user and assistant turn snippets', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-memory-extractor.json')
    await store.clear()

    const messages = [
      {
        type: 'user',
        message: { content: 'build this module' },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'module scaffold created' }] },
      },
    ] as any

    const count = await extractAndStoreTurnMemory(messages, 's1', store)
    expect(count).toBe(2)

    const stats = await store.stats('session_memory')
    expect(stats.recordCount).toBe(2)

    const records = await store.getCollectionRecords('session_memory')
    expect(records.every(record => typeof record.metadata?.scope === 'string')).toBe(
      true,
    )
    expect(records.some(record => record.metadata?.scope === 'project')).toBe(true)

    await store.clear()
  })

  test('returns zero when no textual turn content exists', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-memory-extractor.json')
    await store.clear()

    const messages = [
      { type: 'system', content: 'noop' },
    ] as any

    const count = await extractAndStoreTurnMemory(messages, 's2', store)
    expect(count).toBe(0)

    await store.clear()
  })
})
