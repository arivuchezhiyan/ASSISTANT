import { describe, expect, test } from 'bun:test'

import {
  inferMemoryScope,
  inferQueryScope,
  rerankByRelevance,
} from './rankingScorer.js'

describe('ranking scorer', () => {
  test('infers project scope for code-oriented prompts', () => {
    expect(inferQueryScope('fix this compile error in my project')).toBe(
      'project',
    )
    expect(inferMemoryScope('Refactor this TypeScript function')).toBe('project')
  })

  test('infers personal scope for preference prompts', () => {
    expect(inferQueryScope('remember my coding style preference')).toBe(
      'personal',
    )
  })

  test('reranks scope-aligned memory above non-aligned memory', () => {
    const items = rerankByRelevance(
      [
        {
          id: 'session-1',
          score: 0.9,
          text: 'we chatted about lunch plans',
          metadata: { scope: 'session' },
        },
        {
          id: 'project-1',
          score: 0.75,
          text: 'compile error in unreal build target',
          metadata: { scope: 'project' },
        },
      ],
      'fix compile error in unreal project',
    )

    expect(items[0]?.id).toBe('project-1')
  })
})
