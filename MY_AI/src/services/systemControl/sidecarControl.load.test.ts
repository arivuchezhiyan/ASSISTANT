import { describe, expect, test } from 'bun:test'

import {
  focusWindowWithSidecar,
  openAppWithSidecar,
  readClipboardWithSidecar,
  writeClipboardWithSidecar,
} from './sidecarControl.js'

type LatencySummary = {
  minMs: number
  medianMs: number
  p95Ms: number
  maxMs: number
}

function summarize(values: number[]): LatencySummary {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (quantile: number): number => {
    const index = Math.max(0, Math.min(sorted.length - 1, Math.floor(quantile * sorted.length) - 1))
    return sorted[index] ?? 0
  }
  return {
    minMs: sorted[0] ?? 0,
    medianMs: at(0.5),
    p95Ms: at(0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
  }
}

describe('system control latency and stability under load', () => {
  test('handles 240 mixed control calls with stable latency envelope', async () => {
    const originalFetch = globalThis.fetch
    let callCount = 0

    globalThis.fetch = (async (input, init) => {
      callCount += 1
      const delayMs = 3 + (callCount % 9)
      await new Promise(resolve => setTimeout(resolve, delayMs))

      const url = String(input)
      if (url.endsWith('/system/clipboard/read')) {
        return new Response(JSON.stringify({ text: 'ok' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (url.endsWith('/system/window/focus')) {
        return new Response(JSON.stringify({ focused: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      if (init?.method === 'POST') {
        return new Response('', { status: 200 })
      }

      return new Response('not found', { status: 404 })
    }) as typeof fetch

    try {
      const totalCalls = 240
      const latenciesMs: number[] = []
      const tasks: Promise<void>[] = []

      for (let i = 0; i < totalCalls; i += 1) {
        tasks.push(
          (async () => {
            const start = Date.now()
            const mode = i % 4
            if (mode === 0) {
              await openAppWithSidecar({ appPath: 'code', args: ['.'] })
            } else if (mode === 1) {
              await writeClipboardWithSidecar(`payload-${i}`)
            } else if (mode === 2) {
              await readClipboardWithSidecar()
            } else {
              await focusWindowWithSidecar({ windowTitle: 'Visual Studio Code' })
            }
            latenciesMs.push(Date.now() - start)
          })(),
        )
      }

      await Promise.all(tasks)

      expect(latenciesMs.length).toBe(totalCalls)
      const summary = summarize(latenciesMs)

      // Thresholds are conservative for mocked sidecar latency and ensure no
      // accidental regression to serial or blocking behavior.
      expect(summary.p95Ms).toBeLessThanOrEqual(40)
      expect(summary.maxMs).toBeLessThanOrEqual(60)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
