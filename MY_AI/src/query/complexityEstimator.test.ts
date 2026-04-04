import { describe, expect, test } from 'bun:test'

import { estimateComplexity } from './complexityEstimator.js'

describe('complexity estimator', () => {
  test('returns low for short chat prompts', () => {
    const score = estimateComplexity('hello', {
      category: 'chat',
      complexity: 'low',
    })
    expect(score.level).toBe('low')
  })

  test('returns medium for analysis-oriented prompts', () => {
    const score = estimateComplexity('Please analyze architecture tradeoff options', {
      category: 'analysis',
      complexity: 'medium',
    })
    expect(score.level).toBe('medium')
  })

  test('returns high for code tasks with multi-step phrasing', () => {
    const score = estimateComplexity(
      'Fix this build error with a step by step multi-step plan and optimize performance '.repeat(
        12,
      ),
      {
        category: 'code',
        complexity: 'high',
      },
    )
    expect(score.level).toBe('high')
  })
})
