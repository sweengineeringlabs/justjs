export interface ApiAdapter {
  get<T>(featureId: string): T
}

export interface WsAdapter {
  connect(url: string): Promise<WsConnection>
}

export interface WsConnection {
  send(data: unknown): void
  on(event: string, fn: (data: unknown) => void): () => void
  close(): void
}

export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>
  invalidate(key: string): Promise<void>
}
