import { describe, expect, test } from 'bun:test'

import {
  getSttBackend,
  getTtsBackend,
  routeSttTranscription,
  routeTtsSynthesis,
} from './voiceRouting.js'

describe('voice routing', () => {
  test('defaults to sidecar backends', () => {
    const oldStt = process.env.VOICE_STT_BACKEND
    const oldTts = process.env.VOICE_TTS_BACKEND
    delete process.env.VOICE_STT_BACKEND
    delete process.env.VOICE_TTS_BACKEND

    try {
      expect(getSttBackend()).toBe('sidecar')
      expect(getTtsBackend()).toBe('sidecar')
    } finally {
      process.env.VOICE_STT_BACKEND = oldStt
      process.env.VOICE_TTS_BACKEND = oldTts
    }
  })

  test('routes STT via sidecar endpoint', async () => {
    const oldStt = process.env.VOICE_STT_BACKEND
    const originalFetch = globalThis.fetch
    process.env.VOICE_STT_BACKEND = 'sidecar'
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          text: 'hello from stt',
          language: 'en',
          model: 'fallback',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )) as typeof fetch

    try {
      const result = await routeSttTranscription({ textFallback: 'unused' })
      expect(result.text).toBe('hello from stt')
    } finally {
      process.env.VOICE_STT_BACKEND = oldStt
      globalThis.fetch = originalFetch
    }
  })

  test('routes TTS via sidecar endpoint', async () => {
    const oldTts = process.env.VOICE_TTS_BACKEND
    const originalFetch = globalThis.fetch
    process.env.VOICE_TTS_BACKEND = 'sidecar'
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
          headers: { 'content-type': 'application/json' },
        },
      )) as typeof fetch

    try {
      const result = await routeTtsSynthesis({ text: 'hello from tts' })
      expect(result.format).toBe('wav')
      expect(result.audioBase64.length).toBeGreaterThan(0)
    } finally {
      process.env.VOICE_TTS_BACKEND = oldTts
      globalThis.fetch = originalFetch
    }
  })
})
