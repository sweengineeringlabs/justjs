import { describe, it, expect, mock, beforeEach } from "bun:test"
import { DefaultFetchAdapter } from "../core/fetch_adapter.js"

describe("DefaultFetchAdapter", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  it("test_fetch_delegates_to_globalThis_fetch_with_url", async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 })
    globalThis.fetch = mock(() => Promise.resolve(mockResponse))

    const adapter = new DefaultFetchAdapter()
    const result = await adapter.fetch({ url: "https://api.example.com/data" })

    expect(result.status).toBe(200)
    expect(result.ok).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.example.com/data", {})
    globalThis.fetch = originalFetch
  })

  it("test_fetch_passes_method_headers_and_body", async () => {
    const mockResponse = new Response("{}", { status: 201 })
    globalThis.fetch = mock(() => Promise.resolve(mockResponse))

    const adapter = new DefaultFetchAdapter()
    await adapter.fetch({
      url: "/upload",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "data",
    })

    expect(globalThis.fetch).toHaveBeenCalledWith("/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "data",
    })
    globalThis.fetch = originalFetch
  })

  it("test_fetch_maps_response_shape", async () => {
    const mockResponse = new Response("plain text body", {
      status: 404,
      statusText: "Not Found",
      headers: { "x-custom": "yes" },
    })
    globalThis.fetch = mock(() => Promise.resolve(mockResponse))

    const adapter = new DefaultFetchAdapter()
    const result = await adapter.fetch({ url: "https://api.example.com/missing" })

    expect(result.status).toBe(404)
    expect(result.statusText).toBe("Not Found")
    expect(result.ok).toBe(false)
    expect(result.body).toBe("plain text body")
    expect(result.headers["x-custom"]).toBe("yes")
    globalThis.fetch = originalFetch
  })

  it("test_fetch_derives_abort_signal_from_timeout_when_no_signal_given", async () => {
    const mockResponse = new Response("{}", { status: 200 })
    globalThis.fetch = mock((_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Promise.resolve(mockResponse)
    })

    const adapter = new DefaultFetchAdapter()
    await adapter.fetch({ url: "https://api.example.com/data", timeout: 5000 })

    globalThis.fetch = originalFetch
  })
})
