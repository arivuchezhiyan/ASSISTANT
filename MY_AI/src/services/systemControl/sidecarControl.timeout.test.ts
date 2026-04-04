import { describe, expect, test } from 'bun:test'

import { readClipboardWithSidecar } from './sidecarControl.js'

describe('sidecarControl timeouts', () => {
  test('times out slow sidecar request with clear message', async () => {
    const previousTimeout = process.env.PYTHON_SIDECAR_TIMEOUT_MS
    process.env.PYTHON_SIDECAR_TIMEOUT_MS = '20'

    const originalFetch = globalThis.fetch
    globalThis.fetch = (async (_input, init) => {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (init?.signal?.aborted) {
        throw new DOMException('aborted', 'AbortError')
      }
      return new Response(JSON.stringify({ text: 'late' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as typeof fetch

    try {
      await expect(readClipboardWithSidecar()).rejects.toThrow('request timed out')
    } finally {
      globalThis.fetch = originalFetch
      process.env.PYTHON_SIDECAR_TIMEOUT_MS = previousTimeout
    }
  })
})
