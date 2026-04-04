import type { Tool } from '../../Tool.js'

type CacheEntry = {
  value: unknown
  expiresAtMs: number
}

const CACHE = new Map<string, CacheEntry>()

function getTtlMs(): number {
  const raw = process.env.TOOL_CACHE_TTL_SECONDS
  const parsed = raw ? Number(raw) : NaN
  const ttlSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 300
  return Math.floor(ttlSeconds * 1000)
}

export function isToolResultCacheEnabled(): boolean {
  if (process.env.ENABLE_TOOL_RESULT_CACHE === 'false') {
    return false
  }
  return getTtlMs() > 0
}

export function buildToolResultCacheKey(
  toolName: string,
  input: unknown,
): string | null {
  try {
    return `${toolName}:${JSON.stringify(input)}`
  } catch {
    return null
  }
}

export function getCachedToolResult(cacheKey: string): unknown | undefined {
  const entry = CACHE.get(cacheKey)
  if (!entry) return undefined
  if (Date.now() > entry.expiresAtMs) {
    CACHE.delete(cacheKey)
    return undefined
  }
  return entry.value
}

export function getStaleCachedToolResult(cacheKey: string): unknown | undefined {
  const entry = CACHE.get(cacheKey)
  return entry?.value
}

export function setCachedToolResult(cacheKey: string, value: unknown): void {
  CACHE.set(cacheKey, {
    value,
    expiresAtMs: Date.now() + getTtlMs(),
  })
}

export function shouldCacheToolCall(tool: Tool, isMcpTool: boolean): boolean {
  if (!isToolResultCacheEnabled()) return false
  if (isMcpTool) return false
  return true
}

export function clearToolResultCache(): void {
  CACHE.clear()
}
