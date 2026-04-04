type CacheEntry<T> = {
  value: T
  expiresAtMs: number
}

export type ToolResultCacheOptions = {
  defaultTtlMs?: number
  maxEntries?: number
}

export class ToolResultCache<T> {
  private store = new Map<string, CacheEntry<T>>()
  private readonly defaultTtlMs: number
  private readonly maxEntries: number

  constructor(options?: ToolResultCacheOptions) {
    this.defaultTtlMs = Math.max(1, options?.defaultTtlMs ?? 30_000)
    this.maxEntries = Math.max(1, options?.maxEntries ?? 500)
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    this.evictExpired()
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey) this.store.delete(oldestKey)
    }
    this.store.set(key, {
      value,
      expiresAtMs: Date.now() + Math.max(1, ttlMs),
    })
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() >= entry.expiresAtMs) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  delete(key: string): boolean {
    return this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  evictExpired(): number {
    let removed = 0
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.expiresAtMs) {
        this.store.delete(key)
        removed += 1
      }
    }
    return removed
  }

  stats(): { entries: number; defaultTtlMs: number; maxEntries: number } {
    this.evictExpired()
    return {
      entries: this.store.size,
      defaultTtlMs: this.defaultTtlMs,
      maxEntries: this.maxEntries,
    }
  }
}
