import type { FetchAdapter, FetchRequest, FetchResponse } from "../api/fetch.js"

export class DefaultFetchAdapter implements FetchAdapter {
  async fetch(request: FetchRequest): Promise<FetchResponse> {
    const init: RequestInit = {}
    if (request.method !== undefined) init.method = request.method
    if (request.headers !== undefined) init.headers = request.headers
    if (request.body !== undefined) init.body = request.body
    const signal = request.signal ?? (request.timeout ? AbortSignal.timeout(request.timeout) : undefined)
    if (signal !== undefined) init.signal = signal

    const res = await globalThis.fetch(request.url, init)

    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })

    return {
      status: res.status,
      statusText: res.statusText,
      headers,
      body: await res.text(),
      ok: res.ok,
    }
  }
}
