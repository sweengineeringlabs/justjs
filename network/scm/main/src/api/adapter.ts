export interface FetchAdapter {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export interface WsAdapter {
  connect(url: string): Promise<WsConnection>
}

export interface WsConnection {
  send(data: unknown): void
  on(event: string, fn: (data: unknown) => void): () => void
  close(): void
}

export type NetworkErrorCode =
  | "FETCH_FAILED"
  | "WS_CONNECT_FAILED"
  | "WS_CLOSED"
  | "TIMEOUT"

export interface NetworkError extends Error {
  readonly code: NetworkErrorCode
}
