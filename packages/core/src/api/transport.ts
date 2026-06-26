export interface ApiAdapter {
  get<T>(featureId: string):                        Promise<T | null>
  mutate<T>(featureId: string, payload: unknown):   Promise<T>
  upload<T>(featureId: string, data: Blob | ArrayBuffer): Promise<T>
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
