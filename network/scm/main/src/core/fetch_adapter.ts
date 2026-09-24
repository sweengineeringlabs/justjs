import type { FetchRequest, FetchResponse, FetchAdapter } from "../api/fetch.js"
import { NetworkError } from "../api/fetch.js"

// justjs#155 Task 1: no outbound call in the framework goes straight to
// globalThis.fetch() anymore -- every DefaultFetchAdapter routes through
// an edge-bootstrap transport-proxy Handler (scm/examples/transport-proxy.rs
// in edge-bootstrap), which owns the real outbound egress. The proxy's
// endpoint is process-wide config, set once by the composition root
// (e.g. application/core/boot.ts), not per-adapter -- createFetchAdapter()
// stays a zero-arg factory for its 30+ existing call sites.
let transportProxyUrl: string | undefined

export function configureTransportProxy(url: string): void {
  transportProxyUrl = url
}

// Test-only: bun:test has no per-test module reset, and this module's
// proxy config is intentionally process-wide state (see configureTransportProxy
// above) -- tests need a way back to "unconfigured" between cases.
export function resetTransportProxyConfigForTests(): void {
  transportProxyUrl = undefined
}

interface ProxyRequestBody {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  bodyEncoding?: "utf8" | "base64"
}

interface ProxyResponseBody {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  ok: boolean
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// Mirrors transport-proxy.rs's ProxyRequest.bodyEncoding contract: a
// string body travels as utf8; Uint8Array/ArrayBuffer (the real, tested
// binary case -- e.g. @justjs/cloud-connect's Heroku tarball PUT) is
// base64-encoded so it survives the JSON envelope unchanged. FormData/Blob
// are not yet supported by transport-proxy -- a real, disclosed gap.
function encodeBody(body: FetchRequest["body"]): Pick<ProxyRequestBody, "body" | "bodyEncoding"> {
  if (body === undefined) return {}
  if (typeof body === "string") return { body, bodyEncoding: "utf8" }
  if (body instanceof Uint8Array) return { body: bytesToBase64(body), bodyEncoding: "base64" }
  if (body instanceof ArrayBuffer) return { body: bytesToBase64(new Uint8Array(body)), bodyEncoding: "base64" }
  throw new NetworkError(
    "unsupported_body_type",
    undefined,
    "DefaultFetchAdapter's transport-proxy routing supports string, Uint8Array, and ArrayBuffer bodies only -- FormData/Blob are not yet supported",
  )
}

export class DefaultFetchAdapter implements FetchAdapter {
  async fetch(request: FetchRequest): Promise<FetchResponse> {
    if (transportProxyUrl === undefined) {
      throw new NetworkError(
        "transport_proxy_not_configured",
        undefined,
        "DefaultFetchAdapter requires configureTransportProxy(url) to be called once at process startup, before any outbound request",
      )
    }

    const signal = request.signal ?? (request.timeout ? AbortSignal.timeout(request.timeout) : undefined)

    const proxyReq: ProxyRequestBody = { url: request.url }
    if (request.method !== undefined) proxyReq.method = request.method
    if (request.headers !== undefined) proxyReq.headers = request.headers
    Object.assign(proxyReq, encodeBody(request.body))

    const init: RequestInit = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proxyReq),
    }
    if (signal !== undefined) init.signal = signal

    let res: Response
    try {
      res = await globalThis.fetch(transportProxyUrl, init)
    } catch (cause) {
      throw new NetworkError(
        "transport_proxy_unreachable",
        undefined,
        `could not reach transport-proxy at ${transportProxyUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
      )
    }

    if (!res.ok) {
      throw new NetworkError(
        "transport_proxy_error",
        res.status,
        `transport-proxy at ${transportProxyUrl} rejected the request: ${res.status} ${res.statusText}`,
      )
    }

    const proxied = (await res.json()) as ProxyResponseBody
    return {
      status: proxied.status,
      statusText: proxied.statusText,
      headers: proxied.headers,
      body: proxied.body,
      ok: proxied.ok,
    }
  }
}
