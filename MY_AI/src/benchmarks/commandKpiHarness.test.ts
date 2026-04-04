import { describe, expect, test } from 'bun:test'

import { runKpiHarness, summarizeKpis } from './commandKpiHarness.js'

describe('command KPI harness', () => {
  test('summarizes percentile and success metrics by operation', () => {
    const summary = summarizeKpis([
      { operation: 'open-app', durationMs: 12, ok: true },
      { operation: 'open-app', durationMs: 24, ok: true },
      { operation: 'open-app', durationMs: 36, ok: false },
      { operation: 'clipboard-read', durationMs: 8, ok: true },
    ])

    const openApp = summary.find(item => item.operation === 'open-app')
    expect(openApp?.total).toBe(3)
    expect(openApp?.successRate).toBeCloseTo(2 / 3)
    expect(openApp?.maxMs).toBe(36)
  })

  test('runs harness and captures failures as KPI samples', async () => {
    const result = await runKpiHarness([
      {
        operation: 'ok-op',
        run: async () => {
          await Promise.resolve()
        },
      },
      {
        operation: 'bad-op',
        run: async () => {
          throw new Error('fail')
        },
      },
    ])

    const bad = result.find(item => item.operation === 'bad-op')
    expect(bad?.total).toBe(1)
    expect(bad?.successRate).toBe(0)
  })
})
