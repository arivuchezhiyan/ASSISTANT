import { describe, expect, test } from 'bun:test'

import { transcribeWithSidecar } from './sttAdapter.js'

describe('transcribeWithSidecar', () => {
  test('throws when sidecar returns an error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response('boom', {
        status: 500,
      })) as typeof fetch

    try {
      await expect(
        transcribeWithSidecar({ textFallback: 'hello world' }),
      ).rejects.toThrow('STT sidecar request failed')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('returns transcript when sidecar succeeds', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          text: 'hello world',
          language: 'en',
          model: 'fallback',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      )) as typeof fetch

    try {
      const transcript = await transcribeWithSidecar({ textFallback: 'unused' })
      expect(transcript.text).toBe('hello world')
      expect(transcript.language).toBe('en')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
