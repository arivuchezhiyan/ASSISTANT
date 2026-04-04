import { describe, expect, test } from 'bun:test'
import { readFile } from 'fs/promises'

import {
  exportMemories,
  forgetMemory,
  pinMemory,
  redactMemory,
} from './memoryGovernance.js'
import { DiskVectorStoreAdapter } from './vectorStore.js'

describe('memory governance', () => {
  test('pin marks memory as pinned', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-memory-governance.json')
    await store.clear()
    await store.upsert('session_memory', [
      { id: 'm1', vector: [1, 0], text: 'hello', metadata: { role: 'user' } },
    ])

    const ok = await pinMemory('m1', store)
    expect(ok).toBe(true)

    const records = await store.getCollectionRecords('session_memory')
    expect(records[0]?.metadata?.pinned).toBe(true)
    await store.clear()
  })

  test('redact masks memory text', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-memory-governance.json')
    await store.clear()
    await store.upsert('session_memory', [
      { id: 'm2', vector: [1, 0], text: 'secret', metadata: { role: 'user' } },
    ])

    const ok = await redactMemory('m2', store)
    expect(ok).toBe(true)

    const records = await store.getCollectionRecords('session_memory')
    expect(records[0]?.text).toBe('[REDACTED]')
    expect(records[0]?.metadata?.redacted).toBe(true)
    await store.clear()
  })

  test('forget deletes memory', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-memory-governance.json')
    await store.clear()
    await store.upsert('session_memory', [
      { id: 'm3', vector: [1, 0], text: 'bye' },
    ])

    const ok = await forgetMemory('m3', store)
    expect(ok).toBe(true)

    const stats = await store.stats('session_memory')
    expect(stats.recordCount).toBe(0)
    await store.clear()
  })

  test('export writes json file', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-memory-governance.json')
    await store.clear()
    await store.upsert('session_memory', [
      { id: 'm4', vector: [1, 0], text: 'export me' },
    ])

    const exportPath = await exportMemories('./data/test-memory-export.json', store)
    const raw = await readFile(exportPath, 'utf8')
    expect(raw.includes('m4')).toBe(true)
    await store.clear()
  })
})
