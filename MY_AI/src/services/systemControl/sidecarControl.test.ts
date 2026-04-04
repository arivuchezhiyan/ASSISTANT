import { describe, expect, test } from 'bun:test'

import {
  focusWindowWithSidecar,
  getSidecarHealth,
  getSidecarVoiceCapabilities,
  processExistsWithSidecar,
  readClipboardWithSidecar,
  synthesizeWithSidecar,
  transcribeWithSidecar,
  writeClipboardWithSidecar,
} from './sidecarControl.js'

describe('sidecarControl', () => {
  test('reads clipboard text from sidecar', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ text: 'hello' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch

    try {
      const text = await readClipboardWithSidecar()
      expect(text).toBe('hello')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('writes clipboard text to sidecar', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () => new Response('', { status: 200 })) as typeof fetch

    try {
      await expect(writeClipboardWithSidecar('hello')).resolves.toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('focuses window via sidecar', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ focused: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch

    try {
      const focused = await focusWindowWithSidecar({ windowTitle: 'Visual Studio Code' })
      expect(focused).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('reads sidecar health metadata', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          sidecar: 'python',
          stt_model: 'small.en',
          stt_available: 'true',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )) as typeof fetch

    try {
      const health = await getSidecarHealth()
      expect(health.status).toBe('ok')
      expect(health.sidecar).toBe('python')
      expect(health.stt_available).toBe('true')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('reads sidecar voice capabilities', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          stt_available: true,
          stt_model: 'small.en',
          tts_engine: 'fallback_tone',
          tts_sample_rate_hz: 22050,
          max_text_fallback_chars: 4096,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )) as typeof fetch

    try {
      const caps = await getSidecarVoiceCapabilities()
      expect(caps.stt_available).toBe(true)
      expect(caps.tts_engine).toBe('fallback_tone')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('transcribes via sidecar voice STT endpoint', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          text: 'hello from stt',
          language: 'en',
          model: 'small.en',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      )) as typeof fetch

    try {
      const result = await transcribeWithSidecar({ textFallback: 'hello from stt' })
      expect(result.text).toBe('hello from stt')
      expect(result.model).toBe('small.en')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('synthesizes via sidecar voice TTS endpoint', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          audio_base64: 'UklGRgAA',
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
      const result = await synthesizeWithSidecar({ text: 'hello world' })
      expect(result.format).toBe('wav')
      expect(result.engine).toBe('fallback_tone')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('checks process existence via sidecar', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ exists: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch

    try {
      const exists = await processExistsWithSidecar({ processName: 'code.exe' })
      expect(exists).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('normalizes sidecar json error detail', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ detail: 'focus denied' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch

    try {
      await expect(
        focusWindowWithSidecar({ windowTitle: 'Visual Studio Code' }),
      ).rejects.toThrow('focus denied')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
