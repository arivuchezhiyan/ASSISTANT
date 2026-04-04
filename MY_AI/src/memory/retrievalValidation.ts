import type { VectorSearchResult } from './vectorStore.js'

export type RetrievalQualityReport = {
  topK: number
  returnedCount: number
  minScore: number
  avgScore: number
  passQualityGate: boolean
}

export type RetrievalRamSafetyReport = {
  estimatedBytes: number
  estimatedMb: number
  budgetMb: number
  passRamGate: boolean
}

export type RetrievalValidationReport = {
  quality: RetrievalQualityReport
  ram: RetrievalRamSafetyReport
  pass: boolean
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function estimateItemBytes(item: VectorSearchResult): number {
  const textBytes = item.text ? item.text.length * 2 : 0
  const metadataBytes = item.metadata
    ? JSON.stringify(item.metadata).length * 2
    : 0
  // Score + id overhead for rough runtime estimate.
  return textBytes + metadataBytes + item.id.length * 2 + 64
}

export function validateRetrieval(
  items: VectorSearchResult[],
  options?: {
    topK?: number
    minAvgScore?: number
    minScoreThreshold?: number
    maxRamBudgetMb?: number
  },
): RetrievalValidationReport {
  const topK = Math.max(1, Math.floor(options?.topK ?? 5))
  const minAvgScore = options?.minAvgScore ?? 0.5
  const minScoreThreshold = options?.minScoreThreshold ?? 0
  const maxRamBudgetMb = options?.maxRamBudgetMb ?? 8

  const scores = items.map(item => item.score)
  const avgScore = average(scores)
  const minScore = items.length === 0 ? 0 : Math.min(...scores)

  const estimatedBytes = items.reduce(
    (sum, item) => sum + estimateItemBytes(item),
    0,
  )
  const estimatedMb = estimatedBytes / (1024 * 1024)

  const qualityPass =
    items.length <= topK &&
    (items.length === 0 ||
      (avgScore >= minAvgScore && minScore >= minScoreThreshold))

  const ramPass = estimatedMb <= maxRamBudgetMb

  return {
    quality: {
      topK,
      returnedCount: items.length,
      minScore,
      avgScore,
      passQualityGate: qualityPass,
    },
    ram: {
      estimatedBytes,
      estimatedMb,
      budgetMb: maxRamBudgetMb,
      passRamGate: ramPass,
    },
    pass: qualityPass && ramPass,
  }
}
