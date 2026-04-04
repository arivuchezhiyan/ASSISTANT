import { DiskVectorStoreAdapter, type VectorSearchResult } from './vectorStore.js'
import {
  inferQueryScope,
  rerankByRelevance,
  type MemoryScope,
} from './rankingScorer.js'
import {
  validateRetrieval,
  type RetrievalValidationReport,
} from './retrievalValidation.js'

export type EmbedFn = (text: string) => Promise<number[]>

export type RetrievalRequest = {
  collection: string
  queryText: string
  topK?: number
  minScore?: number
  scope?: MemoryScope
}

export type RetrievalResult = {
  items: VectorSearchResult[]
  effectiveTopK: number
  validation: RetrievalValidationReport
}

function clampTopK(topK: number): number {
  if (!Number.isFinite(topK) || topK <= 0) return 5
  return Math.min(20, Math.max(1, Math.floor(topK)))
}

function getDefaultTopK(): number {
  const raw = process.env.RAG_TOP_K
  const parsed = raw ? Number(raw) : NaN
  return clampTopK(parsed)
}

// Lightweight deterministic embedding fallback for local pipeline wiring.
function hashEmbed(text: string): number[] {
  const vector = new Array<number>(32).fill(0)
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    const slot = i % vector.length
    vector[slot] += (code % 97) / 97
  }
  return vector
}

export class RagRetriever {
  private store: DiskVectorStoreAdapter
  private embedFn: EmbedFn

  constructor(
    store = new DiskVectorStoreAdapter(),
    embedFn: EmbedFn = async text => hashEmbed(text),
  ) {
    this.store = store
    this.embedFn = embedFn
  }

  async retrieve(req: RetrievalRequest): Promise<RetrievalResult> {
    const effectiveTopK = clampTopK(req.topK ?? getDefaultTopK())
    const queryVector = await this.embedFn(req.queryText)
    const rawItems = await this.store.query(
      req.collection,
      queryVector,
      effectiveTopK,
    )
    const queryScope = req.scope ?? inferQueryScope(req.queryText)
    const items = rerankByRelevance(rawItems, req.queryText, queryScope)
    const validation = validateRetrieval(items, {
      topK: effectiveTopK,
      minAvgScore: Number(process.env.RAG_MIN_AVG_SCORE ?? 0.2),
      minScoreThreshold: Number(process.env.RAG_MIN_SCORE ?? -1),
      maxRamBudgetMb: Number(process.env.RAG_MAX_RAM_MB ?? 8),
    })

    if (typeof req.minScore !== 'number') {
      return { items, effectiveTopK, validation }
    }

    return {
      items: items.filter(item => item.score >= req.minScore!),
      effectiveTopK,
      validation,
    }
  }
}
