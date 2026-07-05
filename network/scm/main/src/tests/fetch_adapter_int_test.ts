import { describe, it, expect, mock, beforeEach } from "bun:test"
import { DefaultFetchAdapter } from "../core/fetch_adapter.js"

describe("DefaultFetchAdapter", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  it("test_fetch_delegates_to_globalThis_fetch", async () => {
    const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 })
    globalThis.fetch = mock(() => Promise.resolve(mockResponse))

    const adapter = new DefaultFetchAdapter()
    const result  = await adapter.fetch("https://api.example.com/data")

    expect(result.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.example.com/data", undefined)
    globalThis.fetch = originalFetch
  })

  it("test_fetch_passes_init_options", async () => {
    const mockResponse = new Response("{}", { status: 201 })
    globalThis.fetch = mock(() => Promise.resolve(mockResponse))

    const adapter = new DefaultFetchAdapter()
    const init    = { method: "POST", body: "data" }
    await adapter.fetch("/upload", init)

    expect(globalThis.fetch).toHaveBeenCalledWith("/upload", init)
    globalThis.fetch = originalFetch
  })
})
