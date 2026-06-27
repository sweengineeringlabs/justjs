import type { ApiAdapter, ApiResponse } from "../api/api_adapter.js"
import { TransportError } from "../api/api_adapter.js"

export class DefaultApiAdapter implements ApiAdapter {
  async get<T = unknown>(url: string): Promise<ApiResponse<T>> {
    throw new TransportError("NOT_IMPLEMENTED")
  }

  async post<T = unknown>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    throw new TransportError("NOT_IMPLEMENTED")
  }

  async put<T = unknown>(url: string, body?: unknown): Promise<ApiResponse<T>> {
    throw new TransportError("NOT_IMPLEMENTED")
  }

  async delete<T = unknown>(url: string): Promise<ApiResponse<T>> {
    throw new TransportError("NOT_IMPLEMENTED")
  }
}
