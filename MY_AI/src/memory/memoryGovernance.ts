import { mkdir, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'

import { DiskVectorStoreAdapter, type VectorStoreRecord } from './vectorStore.js'

export type GovernanceAction = 'pin' | 'forget' | 'redact' | 'export'

async function findById(
  store: DiskVectorStoreAdapter,
  id: string,
): Promise<VectorStoreRecord | null> {
  const records = await store.getCollectionRecords('session_memory')
  return records.find(r => r.id === id) ?? null
}

export async function pinMemory(
  id: string,
  store = new DiskVectorStoreAdapter(),
): Promise<boolean> {
  const record = await findById(store, id)
  if (!record) return false

  await store.upsert('session_memory', [
    {
      ...record,
      metadata: {
        ...(record.metadata ?? {}),
        pinned: true,
      },
    },
  ])
  return true
}

export async function forgetMemory(
  id: string,
  store = new DiskVectorStoreAdapter(),
): Promise<boolean> {
  const removed = await store.delete('session_memory', [id])
  return removed > 0
}

export async function redactMemory(
  id: string,
  store = new DiskVectorStoreAdapter(),
): Promise<boolean> {
  const record = await findById(store, id)
  if (!record) return false

  await store.upsert('session_memory', [
    {
      ...record,
      text: '[REDACTED]',
      metadata: {
        ...(record.metadata ?? {}),
        redacted: true,
      },
    },
  ])
  return true
}

export async function exportMemories(
  outputPath?: string,
  store = new DiskVectorStoreAdapter(),
): Promise<string> {
  const records = await store.getCollectionRecords('session_memory')
  const path = outputPath
    ? resolve(process.cwd(), outputPath)
    : resolve(process.cwd(), `./data/memory-export-${Date.now()}.json`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify({ records }, null, 2), 'utf8')
  return path
}
