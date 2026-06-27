import type { CacheAdapter } from "../api/adapter.js"

interface CacheEntry<T> {
  value:   T
  expires: number | null
}

export class InMemoryCacheAdapter implements CacheAdapter {
  readonly #store = new Map<string, CacheEntry<unknown>>()

  async get<T>(key: string): Promise<T | null> {
    const entry = this.#store.get(key)
    if (entry === undefined) return null
    if (entry.expires !== null && entry.expires < Date.now()) {
      this.#store.delete(key)
      return null
    }
    return entry.value as T
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.#store.set(key, {
      value,
      expires: ttlMs !== undefined ? Date.now() + ttlMs : null,
    })
  }

  async invalidate(key: string): Promise<void> {
    this.#store.delete(key)
  }
}
