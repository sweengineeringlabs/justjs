export interface ApiAdapter {
  get<T>(featureId: string): Promise<T | null>
  mutate<T>(featureId: string, payload: unknown): Promise<T>
  upload<T>(featureId: string, data: Blob | ArrayBuffer): Promise<T>
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>
  invalidate(key: string): Promise<void>
}

export type TransportErrorCode =
  | "REQUEST_FAILED"
  | "RESPONSE_PARSE_FAILED"
  | "CACHE_MISS"
  | "UPLOAD_FAILED"

export interface TransportError extends Error {
  readonly code:   TransportErrorCode
  readonly status?: number
}
