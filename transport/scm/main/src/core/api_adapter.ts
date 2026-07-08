import type { ApiAdapter, ApiRequest, ApiResponse } from "../api/api_adapter.js"
import { TransportError } from "../api/api_adapter.js"
import type { FetchAdapter, FetchRequest, FetchResponse } from "@justjs/network"

export class DefaultApiAdapter implements ApiAdapter {
  constructor(private readonly fetchAdapter: FetchAdapter) {}

  async get<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.execute<T>({ ...options, url, method: "GET" })
  }

  async post<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.execute<T>({ ...options, url, method: "POST", body })
  }

  async put<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.execute<T>({ ...options, url, method: "PUT", body })
  }

  async delete<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.execute<T>({ ...options, url, method: "DELETE" })
  }

  private async execute<T>(request: Partial<ApiRequest> & { url: string }): Promise<ApiResponse<T>> {
    let response: FetchResponse
    try {
      response = await this.fetchAdapter.fetch(this.toFetchRequest(request))
    } catch (error) {
      throw new TransportError(
        "NETWORK_ERROR",
        undefined,
        error instanceof Error ? error.message : String(error)
      )
    }

    const contentType = response.headers["content-type"] ?? ""
    const data = (
      contentType.includes("application/json") && response.body.length > 0
        ? JSON.parse(response.body)
        : response.body
    ) as T

    const base = { status: response.status, data, headers: response.headers }
    return response.ok ? base : { ...base, error: response.statusText || `HTTP ${response.status}` }
  }

  private toFetchRequest(request: Partial<ApiRequest> & { url: string }): FetchRequest {
    const headers: Record<string, string> = { ...request.headers }
    let body: string | FormData | undefined
    if (request.body !== undefined) {
      if (typeof request.body === "string" || request.body instanceof FormData) {
        body = request.body
      } else {
        body = JSON.stringify(request.body)
        if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
          headers["content-type"] = "application/json"
        }
      }
    }

    return {
      url: request.url,
      headers,
      ...(request.method !== undefined ? { method: request.method } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
    }
  }
}
