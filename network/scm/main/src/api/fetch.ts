export interface FetchRequest {
  readonly url: string
  readonly method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD"
  readonly headers?: Record<string, string>
  // Blob/ArrayBuffer/Uint8Array support a real binary upload (e.g.
  // @justjs/cloud-connect's Heroku deploy, which PUTs a gzipped tarball
  // to a presigned URL) - passed straight through to the real
  // `fetch()` call's own BodyInit, never re-encoded.
  readonly body?: string | FormData | Blob | ArrayBuffer | Uint8Array
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
