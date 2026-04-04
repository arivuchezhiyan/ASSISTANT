import type { VectorSearchResult } from './vectorStore.js'

export type MemoryScope = 'project' | 'personal' | 'session'

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3)
}

function overlapScore(a: string, b: string): number {
  const left = new Set(normalizeTokens(a))
  const right = new Set(normalizeTokens(b))
  if (left.size === 0 || right.size === 0) return 0

  let overlap = 0
  for (const token of left) {
    if (right.has(token)) overlap += 1
  }

  return overlap / Math.max(left.size, right.size)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function parseScope(raw: unknown): MemoryScope {
  return raw === 'project' || raw === 'personal' || raw === 'session'
    ? raw
    : 'session'
}

export function inferQueryScope(queryText: string): MemoryScope {
  const text = queryText.toLowerCase()

  if (
    /(project|build|compile|bug|fix|refactor|file|function|class|typescript|python|c\+\+|unreal)/.test(
      text,
    )
  ) {
    return 'project'
  }

  if (
    /(preference|prefer|daily routine|personal|remind me|habit|schedule|my style)/.test(
      text,
    )
  ) {
    return 'personal'
  }

  return 'session'
}

export function inferMemoryScope(text: string): MemoryScope {
  return inferQueryScope(text)
}

export function scoreMemoryRelevance(input: {
  queryText: string
  candidateText: string
  queryScope: MemoryScope
  candidateScope: MemoryScope
  vectorScore: number
}): number {
  const lexical = overlapScore(input.queryText, input.candidateText)
  const scopeBonus = input.queryScope === input.candidateScope ? 0.2 : 0
  const weighted = input.vectorScore * 0.7 + lexical * 0.3 + scopeBonus
  return clamp01(weighted)
}

export function rerankByRelevance(
  items: VectorSearchResult[],
  queryText: string,
  queryScope = inferQueryScope(queryText),
): VectorSearchResult[] {
  const reranked = items.map(item => {
    const candidateScope = parseScope(item.metadata?.scope)
    const score = scoreMemoryRelevance({
      queryText,
      candidateText: item.text ?? '',
      queryScope,
      candidateScope,
      vectorScore: item.score,
    })
    return { ...item, score }
  })

  reranked.sort((a, b) => b.score - a.score)
  return reranked
}
