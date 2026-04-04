import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import { generateAndStoreProactiveSuggestions } from './suggestionEngine.js'

describe('proactive suggestion engine', () => {
  test('generates confidence-scored suggestions and persists them', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-proactive-'))
    const outputPath = path.join(root, 'suggestions.jsonl')

    try {
      const suggestions = await generateAndStoreProactiveSuggestions(
        [
          {
            type: 'user',
            message: { content: 'we implemented a feature, what is next in backlog?' },
          },
          {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'run tests and update gate logs' }] },
          },
        ] as any,
        {
          sessionId: 's-proactive-1',
          outputPath,
        },
      )

      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.every(s => s.confidence > 0 && s.confidence <= 1)).toBe(true)
      expect(suggestions.some(s => s.category === 'validation')).toBe(true)

      const saved = await readFile(outputPath, 'utf8')
      const lines = saved.trim().split('\n')
      expect(lines.length).toBe(suggestions.length)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('returns empty suggestions when no user/assistant text exists', async () => {
    const suggestions = await generateAndStoreProactiveSuggestions(
      [{ type: 'system', message: { content: 'noop' } }] as any,
      {
        sessionId: 's-proactive-2',
        outputPath: path.join(tmpdir(), 'my-ai-proactive-empty.jsonl'),
      },
    )

    expect(suggestions).toEqual([])
  })
})
