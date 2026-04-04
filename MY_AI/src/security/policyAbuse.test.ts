import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

import {
  canUseCachedResult,
  canUseDegradedFallback,
} from '../services/tools/permissionBypassGuard.js'
import { executeWithRecovery } from '../services/tools/recoveryOrchestrator.js'
import { exportMemories, redactMemory } from '../memory/memoryGovernance.js'
import { DiskVectorStoreAdapter } from '../memory/vectorStore.js'
import { decideWebFetchPermissionBehavior } from '../tools/WebFetchTool/permissionPolicy.js'
import { ingestTurnFeedback } from '../feedback/ingestion.js'

async function withTempDir<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(path.join(tmpdir(), 'my-ai-policy-'))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('policy and abuse safety suite', () => {
  test('denied or ask permissions cannot bypass tool guards', () => {
    expect(canUseCachedResult('allow')).toBe(true)
    expect(canUseDegradedFallback('allow')).toBe(true)

    expect(canUseCachedResult('deny')).toBe(false)
    expect(canUseCachedResult('ask')).toBe(false)
    expect(canUseDegradedFallback('deny')).toBe(false)
    expect(canUseDegradedFallback('ask')).toBe(false)
  })

  test('recovery flow escalates non-retriable failures', async () => {
    await expect(
      executeWithRecovery(
        async () => {
          throw new Error('policy violation')
        },
        {
          maxRetries: 5,
          isRetriableError: () => false,
          getDegradedResult: () => 'fallback',
        },
      ),
    ).rejects.toThrow('policy violation')
  })

  test('redaction prevents secret leak in exported memory', async () => {
    await withTempDir(async root => {
      const storePath = path.join(root, 'memory.json')
      const exportPath = path.join(root, 'memory-export.json')
      const store = new DiskVectorStoreAdapter(storePath)

      await store.clear()
      await store.upsert('session_memory', [
        {
          id: 'secret-1',
          vector: [1, 0],
          text: 'apiKey=SUPER_SECRET_TOKEN',
          metadata: { role: 'user' },
        },
      ])

      await redactMemory('secret-1', store)
      await exportMemories(exportPath, store)

      const exported = await readFile(exportPath, 'utf8')
      expect(exported.includes('SUPER_SECRET_TOKEN')).toBe(false)
      expect(exported.includes('[REDACTED]')).toBe(true)

      await store.clear()
    })
  })

  test('webfetch policy enforces deny-by-default for unknown domains', () => {
    const behavior = decideWebFetchPermissionBehavior({
      isPreapproved: false,
      hasDenyRule: false,
      hasAskRule: false,
      hasAllowRule: false,
    })

    expect(behavior).toBe('deny')
  })

  test('webfetch policy honors explicit allow when no deny exists', () => {
    const behavior = decideWebFetchPermissionBehavior({
      isPreapproved: false,
      hasDenyRule: false,
      hasAskRule: false,
      hasAllowRule: true,
    })

    expect(behavior).toBe('allow')
  })

  test('feedback ingestion redacts credential-like patterns before persistence', async () => {
    await withTempDir(async root => {
      const vaultPath = path.join(root, 'feedback-events.jsonl')

      const record = await ingestTurnFeedback(
        [
          {
            type: 'user',
            message: {
              content:
                'api_key=tok_live_123 password=mySecret email admin@example.com',
            },
          },
          {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: 'Using Bearer abc123xyz' }],
            },
          },
        ] as any,
        {
          sessionId: 's-policy-1',
          outcome: 'success',
          vaultPath,
        },
      )

      expect(record).not.toBeNull()
      expect(record?.privacy.redactionCount).toBeGreaterThanOrEqual(3)

      const saved = await readFile(vaultPath, 'utf8')
      expect(saved.includes('tok_live_123')).toBe(false)
      expect(saved.includes('mySecret')).toBe(false)
      expect(saved.includes('admin@example.com')).toBe(false)
      expect(saved.includes('Bearer abc123xyz')).toBe(false)
      expect(saved.includes('[REDACTED_KEY]')).toBe(true)
      expect(saved.includes('[REDACTED_PASSWORD]')).toBe(true)
      expect(saved.includes('[REDACTED_EMAIL]')).toBe(true)
      expect(saved.includes('Bearer [REDACTED_TOKEN]')).toBe(true)
    })
  })
})
