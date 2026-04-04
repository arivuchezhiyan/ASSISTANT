import { describe, expect, test } from 'bun:test'

import { call } from './process-exists.js'

describe('process-exists command', () => {
  test('returns usage when process name is missing', async () => {
    const result = await call('')
    expect(result.type).toBe('text')
    if (result.type === 'text') {
      expect(result.value).toContain('Usage: /process-exists')
    }
  })

  test('reports process running when sidecar returns exists=true', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ exists: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch

    try {
      const result = await call('code.exe')
      expect(result.type).toBe('text')
      if (result.type === 'text') {
        expect(result.value).toContain('Process is running')
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
