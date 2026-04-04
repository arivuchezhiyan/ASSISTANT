import { describe, expect, test } from 'bun:test'

import {
  focusWindowWithSidecar,
  getSidecarHealth,
  processExistsWithSidecar,
  readClipboardWithSidecar,
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
