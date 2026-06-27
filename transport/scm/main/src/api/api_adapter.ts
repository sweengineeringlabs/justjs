export interface ApiRequest {
  readonly url: string
  readonly method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  readonly headers?: Record<string, string>
  readonly body?: unknown
  readonly timeout?: number
}

export interface ApiResponse<T = unknown> {
  readonly status: number
  readonly data: T
  readonly headers: Record<string, string>
  readonly error?: string
}

export interface ApiAdapter {
  get<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>>
  post<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>>
  put<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>>
  delete<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>>
}

export class TransportError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number,
    message?: string
  ) {
    super(message ?? code)
    this.name = "TransportError"
  }
}
