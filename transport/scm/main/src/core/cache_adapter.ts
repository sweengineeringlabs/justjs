import type { CacheAdapter, CacheEntry } from "../api/cache_adapter.js"

const DEFAULT_TTL = 5 * 60 * 1000

export class DefaultCacheAdapter implements CacheAdapter {
  private cache = new Map<string, CacheEntry<unknown>>()

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  async set<T = unknown>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttl,
    }

    this.cache.set(key, entry)
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async clear(): Promise<void> {
    this.cache.clear()
  }
}
