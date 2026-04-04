import { describe, expect, test } from 'bun:test'

import { RagRetriever } from './ragRetriever.js'
import { DiskVectorStoreAdapter } from './vectorStore.js'

describe('rag retriever', () => {
  test('applies top-k constraint and ordering', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-rag-store.json')
    await store.clear()

    const embed = async (text: string): Promise<number[]> => {
      if (text.includes('alpha')) return [1, 0, 0]
      if (text.includes('beta')) return [0, 1, 0]
      return [0, 0, 1]
    }

    await store.upsert('docs', [
      { id: 'a', vector: [1, 0, 0], text: 'alpha doc' },
      { id: 'b', vector: [0.9, 0.1, 0], text: 'alpha near' },
      { id: 'c', vector: [0, 1, 0], text: 'beta doc' },
    ])

    const retriever = new RagRetriever(store, embed)
    const result = await retriever.retrieve({
      collection: 'docs',
      queryText: 'alpha query',
      topK: 2,
    })

    expect(result.effectiveTopK).toBe(2)
    expect(result.items.length).toBe(2)
    expect(result.items[0]?.id).toBe('a')
    expect(result.validation.quality.topK).toBe(2)

    await store.clear()
  })

  test('clamps invalid top-k and supports min score filtering', async () => {
    const store = new DiskVectorStoreAdapter('./data/test-rag-store.json')
    await store.clear()

    const embed = async (): Promise<number[]> => [1, 0]

    await store.upsert('docs', [
      { id: 'a', vector: [1, 0], text: 'good match' },
      { id: 'b', vector: [0, 1], text: 'low match' },
    ])

    const retriever = new RagRetriever(store, embed)
    const result = await retriever.retrieve({
      collection: 'docs',
      queryText: 'any',
      topK: -10,
      minScore: 0.8,
    })

    expect(result.effectiveTopK).toBe(5)
    expect(result.items.length).toBe(1)
    expect(result.items[0]?.id).toBe('a')
    expect(result.validation.pass).toBe(true)

    await store.clear()
  })
})
