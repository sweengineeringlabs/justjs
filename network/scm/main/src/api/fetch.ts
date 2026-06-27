export interface FetchRequest {
  readonly url: string
  readonly method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD"
  readonly headers?: Record<string, string>
  readonly body?: string | FormData
  readonly timeout?: number
  readonly signal?: AbortSignal
}

export interface FetchResponse {
  readonly status: number
  readonly statusText: string
  readonly headers: Record<string, string>
  readonly body: string
  readonly ok: boolean
}

export interface FetchAdapter {
  fetch(request: FetchRequest): Promise<FetchResponse>
}

export class NetworkError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
    message?: string
  ) {
    super(message ?? code)
    this.name = "NetworkError"
  }
}
