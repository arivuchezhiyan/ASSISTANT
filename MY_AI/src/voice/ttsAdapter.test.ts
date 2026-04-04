import { describe, expect, test } from 'bun:test'

import { synthesizeSpeechWithSidecar } from './ttsAdapter.js'

describe('synthesizeSpeechWithSidecar', () => {
  test('throws when sidecar returns an error', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response('boom', {
        status: 500,
      })) as typeof fetch

    try {
      await expect(
        synthesizeSpeechWithSidecar({ text: 'hello world' }),
      ).rejects.toThrow('TTS sidecar request failed')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('returns audio metadata when sidecar succeeds', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          audio_base64: 'UklGRhQAAABXQVZFZm10',
          format: 'wav',
          sample_rate_hz: 22050,
          engine: 'fallback_tone',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      )) as typeof fetch

    try {
      const output = await synthesizeSpeechWithSidecar({ text: 'hello world' })
      expect(output.audioBase64).toBe('UklGRhQAAABXQVZFZm10')
      expect(output.format).toBe('wav')
      expect(output.sampleRateHz).toBe(22050)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
