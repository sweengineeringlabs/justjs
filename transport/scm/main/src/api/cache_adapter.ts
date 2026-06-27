export interface CacheEntry<T> {
  readonly data: T
  readonly expiresAt: number
}

export interface CacheAdapter {
  get<T = unknown>(key: string): Promise<T | null>
  set<T = unknown>(key: string, data: T, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
}

export class CacheError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code)
    this.name = "CacheError"
  }
}
