import type { FetchAdapter, FetchRequest, FetchResponse } from "../api/fetch.js"

export class DefaultFetchAdapter implements FetchAdapter {
  async fetch(request: FetchRequest): Promise<FetchResponse> {
    const init: RequestInit = {}
    if (request.method !== undefined) init.method = request.method
    if (request.headers !== undefined) init.headers = request.headers
    // Cast needed for Uint8Array specifically: TS's DOM lib types
    // BodyInit against ArrayBufferView<ArrayBuffer>, but a plain
    // `new Uint8Array(...)` is typed as Uint8Array<ArrayBufferLike> -
    // a real structural mismatch in the type checker only, not at
    // runtime (a Uint8Array has always been a valid fetch() body).
    if (request.body !== undefined) init.body = request.body as BodyInit
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
