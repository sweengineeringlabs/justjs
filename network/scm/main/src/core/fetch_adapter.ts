import type { FetchAdapter } from "../api/adapter.js"

export class DefaultFetchAdapter implements FetchAdapter {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return globalThis.fetch(input, init)
  }
}
