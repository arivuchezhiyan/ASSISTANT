import { describe, expect, test } from 'bun:test'
import { writeFile } from 'fs/promises'

import { DiskVectorStoreAdapter } from './vectorStore.js'

describe('disk vector store adapter', () => {
  test('upsert and query returns highest similarity first', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-vector-store.json')
    await store.clear()

    await store.upsert('project', [
      { id: 'a', vector: [1, 0, 0], text: 'A' },
      { id: 'b', vector: [0.9, 0.1, 0], text: 'B' },
      { id: 'c', vector: [0, 1, 0], text: 'C' },
    ])

    const results = await store.query('project', [1, 0, 0], 2)
    expect(results.length).toBe(2)
    expect(results[0]?.id).toBe('a')

    await store.clear()
  })

  test('delete removes records and updates stats', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-vector-store.json')
    await store.clear()

    await store.upsert('project', [
      { id: 'a', vector: [1, 0], text: 'A' },
      { id: 'b', vector: [0, 1], text: 'B' },
    ])

    const removed = await store.delete('project', ['a'])
    expect(removed).toBe(1)

    const stats = await store.stats('project')
    expect(stats.recordCount).toBe(1)

    await store.clear()
  })

  test('persists records across adapter restart', async () => {
    const path = './data/test-vector-store-restart.json'
    const storeA = new DiskVectorStoreAdapter(path)
    await storeA.clear()

    await storeA.upsert('project', [
      { id: 'persist-a', vector: [1, 0, 0], text: 'persist me' },
    ])

    const storeB = new DiskVectorStoreAdapter(path)
    const stats = await storeB.stats('project')
    expect(stats.recordCount).toBe(1)

    const results = await storeB.query('project', [1, 0, 0], 1)
    expect(results[0]?.id).toBe('persist-a')

    await storeB.clear()
  })

  test('recovers from corrupted primary file via backup', async () => {
    const path = './data/test-vector-store-recovery.json'
    const store = new DiskVectorStoreAdapter(path)
    await store.clear()

    await store.upsert('project', [
      { id: 'r1', vector: [1, 0], text: 'first snapshot' },
    ])
    await store.upsert('project', [
      { id: 'r2', vector: [0, 1], text: 'second snapshot' },
    ])

    await writeFile(path, '{ broken json', 'utf8')

    const recovered = new DiskVectorStoreAdapter(path)
    const stats = await recovered.stats('project')
    expect(stats.recordCount).toBeGreaterThan(0)

    await recovered.clear()
  })
})
