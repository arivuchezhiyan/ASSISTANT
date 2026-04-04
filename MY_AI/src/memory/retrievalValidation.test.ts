import { describe, expect, test } from 'bun:test'

import { validateRetrieval } from './retrievalValidation.js'

describe('retrieval validation', () => {
  test('passes quality and ram gates for healthy retrieval results', () => {
    const report = validateRetrieval(
      [
        { id: 'a', score: 0.95, text: 'relevant A' },
        { id: 'b', score: 0.88, text: 'relevant B' },
      ],
      {
        topK: 5,
        minAvgScore: 0.6,
        minScoreThreshold: 0.5,
        maxRamBudgetMb: 1,
      },
    )

    expect(report.quality.passQualityGate).toBe(true)
    expect(report.ram.passRamGate).toBe(true)
    expect(report.pass).toBe(true)
  })

  test('fails quality gate when low-score retrieval is returned', () => {
    const report = validateRetrieval(
      [{ id: 'x', score: 0.1, text: 'weak match' }],
      {
        topK: 5,
        minAvgScore: 0.6,
        minScoreThreshold: 0.5,
        maxRamBudgetMb: 1,
      },
    )

    expect(report.quality.passQualityGate).toBe(false)
    expect(report.pass).toBe(false)
  })

  test('fails ram gate when payload exceeds budget', () => {
    const huge = 'x'.repeat(2_000_000)
    const report = validateRetrieval(
      [{ id: 'big', score: 0.9, text: huge }],
      {
        topK: 5,
        minAvgScore: 0.5,
        minScoreThreshold: 0.4,
        maxRamBudgetMb: 0.1,
      },
    )

    expect(report.ram.passRamGate).toBe(false)
    expect(report.pass).toBe(false)
  })
})
