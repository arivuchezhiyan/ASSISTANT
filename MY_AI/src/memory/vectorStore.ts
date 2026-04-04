import { access, mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'

export type VectorStoreRecord = {
  id: string
  vector: number[]
  text?: string
  metadata?: Record<string, string | number | boolean>
  updatedAtMs: number
}

type VectorStoreCollection = {
  records: Record<string, VectorStoreRecord>
}

type VectorStoreState = {
  collections: Record<string, VectorStoreCollection>
}

export type VectorSearchResult = {
  id: string
  score: number
  text?: string
  metadata?: Record<string, string | number | boolean>
}

const DEFAULT_PATH = './data/vector-store.json'

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i]
    const bv = b[i]
    dot += av * bv
    magA += av * av
    magB += bv * bv
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

function getStorePath(): string {
  return resolve(process.cwd(), process.env.VECTOR_STORE_PATH || DEFAULT_PATH)
}

function getBackupPath(filePath: string): string {
  return `${filePath}.bak`
}

function getTempPath(filePath: string): string {
  return `${filePath}.tmp`
}

function normalizeState(state: unknown): VectorStoreState {
  if (!state || typeof state !== 'object') return { collections: {} }
  const rawCollections = (state as { collections?: unknown }).collections
  if (!rawCollections || typeof rawCollections !== 'object') {
    return { collections: {} }
  }

  const normalized: VectorStoreState = { collections: {} }
  for (const [collectionName, collectionValue] of Object.entries(rawCollections)) {
    if (!collectionValue || typeof collectionValue !== 'object') continue

    const records = (collectionValue as { records?: unknown }).records
    if (!records || typeof records !== 'object') {
      normalized.collections[collectionName] = { records: {} }
      continue
    }

    const normalizedRecords: Record<string, VectorStoreRecord> = {}
    for (const [id, record] of Object.entries(records)) {
      if (!record || typeof record !== 'object') continue
      const vector = (record as { vector?: unknown }).vector
      if (!Array.isArray(vector) || vector.length === 0) continue
      if (!vector.every(value => typeof value === 'number')) continue

      normalizedRecords[id] = {
        id,
        vector,
        text: typeof (record as { text?: unknown }).text === 'string'
          ? (record as { text: string }).text
          : undefined,
        metadata:
          (record as { metadata?: unknown }).metadata &&
          typeof (record as { metadata?: unknown }).metadata === 'object'
            ? ((record as { metadata: Record<string, string | number | boolean> })
                .metadata)
            : undefined,
        updatedAtMs:
          typeof (record as { updatedAtMs?: unknown }).updatedAtMs === 'number'
            ? (record as { updatedAtMs: number }).updatedAtMs
            : Date.now(),
      }
    }

    normalized.collections[collectionName] = { records: normalizedRecords }
  }

  return normalized
}

async function loadStateFromPath(filePath: string): Promise<VectorStoreState | null> {
  try {
    const raw = await readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return normalizeState(parsed)
  } catch {
    return null
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function loadState(filePath: string): Promise<VectorStoreState> {
  const primaryExists = await fileExists(filePath)
  const primary = await loadStateFromPath(filePath)
  if (primary) return primary

  // If primary file is intentionally absent (fresh start/clear), do not
  // resurrect stale backup state.
  if (!primaryExists) return { collections: {} }

  const backup = await loadStateFromPath(getBackupPath(filePath))
  if (backup) return backup

  return { collections: {} }
}

async function saveState(filePath: string, state: VectorStoreState): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tempPath = getTempPath(filePath)
  const backupPath = getBackupPath(filePath)

  await writeFile(tempPath, JSON.stringify(state), 'utf8')

  try {
    await rename(filePath, backupPath)
  } catch {
    // No previous state is expected on first write.
  }

  await rm(filePath, { force: true })
  await rename(tempPath, filePath)
}

function ensureCollection(state: VectorStoreState, collection: string): VectorStoreCollection {
  if (!state.collections[collection]) {
    state.collections[collection] = { records: {} }
  }
  return state.collections[collection]
}

export class DiskVectorStoreAdapter {
  private filePath: string

  constructor(filePath = getStorePath()) {
    this.filePath = filePath
  }

  async upsert(collection: string, records: Array<Omit<VectorStoreRecord, 'updatedAtMs'> & { updatedAtMs?: number }>): Promise<void> {
    const state = await loadState(this.filePath)
    const bucket = ensureCollection(state, collection)

    const now = Date.now()
    for (const record of records) {
      if (!record.id || !Array.isArray(record.vector) || record.vector.length === 0) {
        continue
      }
      bucket.records[record.id] = {
        id: record.id,
        vector: record.vector,
        text: record.text,
        metadata: record.metadata,
        updatedAtMs: record.updatedAtMs ?? now,
      }
    }

    await saveState(this.filePath, state)
  }

  async query(collection: string, vector: number[], topK = 5): Promise<VectorSearchResult[]> {
    if (vector.length === 0 || topK <= 0) return []

    const state = await loadState(this.filePath)
    const bucket = state.collections[collection]
    if (!bucket) return []

    const scored: VectorSearchResult[] = []
    for (const record of Object.values(bucket.records)) {
      const score = cosineSimilarity(vector, record.vector)
      scored.push({
        id: record.id,
        score,
        text: record.text,
        metadata: record.metadata,
      })
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  async delete(collection: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const state = await loadState(this.filePath)
    const bucket = state.collections[collection]
    if (!bucket) return 0

    let removed = 0
    for (const id of ids) {
      if (bucket.records[id]) {
        delete bucket.records[id]
        removed += 1
      }
    }

    await saveState(this.filePath, state)
    return removed
  }

  async clear(collection?: string): Promise<void> {
    if (!collection) {
      await rm(this.filePath, { force: true })
      await rm(getBackupPath(this.filePath), { force: true })
      await rm(getTempPath(this.filePath), { force: true })
      return
    }

    const state = await loadState(this.filePath)
    delete state.collections[collection]
    await saveState(this.filePath, state)
  }

  async stats(collection?: string): Promise<{ collectionCount: number; recordCount: number }> {
    const state = await loadState(this.filePath)
    if (collection) {
      const bucket = state.collections[collection]
      return {
        collectionCount: bucket ? 1 : 0,
        recordCount: bucket ? Object.keys(bucket.records).length : 0,
      }
    }

    let recordCount = 0
    for (const bucket of Object.values(state.collections)) {
      recordCount += Object.keys(bucket.records).length
    }

    return {
      collectionCount: Object.keys(state.collections).length,
      recordCount,
    }
  }

  async getCollectionRecords(collection: string): Promise<VectorStoreRecord[]> {
    const state = await loadState(this.filePath)
    const bucket = state.collections[collection]
    if (!bucket) return []
    return Object.values(bucket.records)
  }
}
