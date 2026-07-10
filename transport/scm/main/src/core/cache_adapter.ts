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

  // `ttl` resolves its default in the body, not as a parameter default -
  // justc 0.3.4's iife/cjs bundler drops a parameter carrying a
  // default-value expression from the emitted signature while leaving the
  // body's reference to it intact, producing a real
  // `ReferenceError: ttl is not defined` at runtime for every caller
  // (confirmed live on real android-shell hardware - justjs#16; same root
  // cause as MountStep's runtimeAdapter / js_runtime_shell_bridge's args).
  async set<T = unknown>(key: string, data: T, ttl?: number): Promise<void> {
    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + (ttl ?? DEFAULT_TTL),
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
