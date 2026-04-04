import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import { ingestTurnFeedback } from './ingestion.js'

describe('feedback ingestion pipeline', () => {
  test('writes sanitized feedback records to the local training vault', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'my-ai-feedback-'))
    const vaultPath = path.join(root, 'feedback.jsonl')

    try {
      const record = await ingestTurnFeedback(
        [
          {
            type: 'user',
            message: {
              content:
                'email me at user@example.com api_key=sk-secret password=hunter2',
            },
          },
          {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Using Bearer token-abc123 now.' }],
            },
          },
        ] as any,
        {
          sessionId: 's-feedback-1',
          outcome: 'success',
          vaultPath,
        },
      )

      expect(record).not.toBeNull()
      expect(record?.privacy.redactionCount).toBeGreaterThanOrEqual(3)
      expect(record?.userText).toContain('[REDACTED_EMAIL]')
      expect(record?.userText).toContain('[REDACTED_KEY]')
      expect(record?.userText).toContain('[REDACTED_PASSWORD]')
      expect(record?.assistantText).toContain('Bearer [REDACTED_TOKEN]')

      const saved = await readFile(vaultPath, 'utf8')
      const lines = saved.trim().split('\n')
      expect(lines.length).toBe(1)

      const parsed = JSON.parse(lines[0] as string) as {
        outcome: string
        source: string
      }
      expect(parsed.outcome).toBe('success')
      expect(parsed.source).toBe('query-engine')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('returns null when no user/assistant text is available', async () => {
    const record = await ingestTurnFeedback(
      [{ type: 'system', message: { content: 'noop' } }] as any,
      {
        sessionId: 's-feedback-empty',
        outcome: 'error',
        vaultPath: path.join(tmpdir(), 'feedback-empty.jsonl'),
      },
    )

    expect(record).toBeNull()
  })
})
