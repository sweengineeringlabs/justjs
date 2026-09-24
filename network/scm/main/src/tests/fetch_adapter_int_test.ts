import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { NetworkError } from "../api/fetch.js"
import { DefaultFetchAdapter, configureTransportProxy, resetTransportProxyConfigForTests } from "../core/fetch_adapter.js"

const PROXY_URL = "http://127.0.0.1:18895/proxy"

describe("DefaultFetchAdapter (justjs#155 Task 1: routed through edge-bootstrap transport-proxy)", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetTransportProxyConfigForTests()
  })

  it("test_fetch_throws_network_error_when_proxy_not_configured", async () => {
    const adapter = new DefaultFetchAdapter()
    await expect(adapter.fetch({ url: "https://api.example.com/data" })).rejects.toThrow(NetworkError)
    await expect(adapter.fetch({ url: "https://api.example.com/data" })).rejects.toMatchObject({
      code: "transport_proxy_not_configured",
    })
  })

  it("test_fetch_posts_to_the_configured_proxy_url_not_the_target_url", async () => {
    configureTransportProxy(PROXY_URL)
    const mockResponse = new Response(
      JSON.stringify({ status: 200, statusText: "OK", headers: {}, body: "{}", ok: true }),
      { status: 200 }
    )
    globalThis.fetch = mock(() => Promise.resolve(mockResponse))

    const adapter = new DefaultFetchAdapter()
    await adapter.fetch({ url: "https://api.example.com/data" })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [calledUrl] = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0]
    expect(calledUrl).toBe(PROXY_URL)
  })

  it("test_fetch_encodes_a_string_body_as_utf8_in_the_proxy_envelope", async () => {
    configureTransportProxy(PROXY_URL)
    const mockResponse = new Response(
      JSON.stringify({ status: 201, statusText: "Created", headers: {}, body: "{}", ok: true }),
      { status: 200 }
    )
    globalThis.fetch = mock(() => Promise.resolve(mockResponse))

    const adapter = new DefaultFetchAdapter()
    await adapter.fetch({
      url: "/upload",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "data",
    })

    const [, init] = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0]
    const sent = JSON.parse((init as RequestInit).body as string)
    expect(sent).toEqual({
      url: "/upload",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "data",
      bodyEncoding: "utf8",
    })
  })

  it("test_fetch_encodes_a_binary_uint8array_body_as_base64_in_the_proxy_envelope", async () => {
    // Regression test for a real gap: a binary body (e.g. a gzipped
    // tarball PUT to a presigned upload URL, @justjs/cloud-connect's
    // Heroku deploy) must survive the proxy's JSON envelope intact.
    // Routing through transport-proxy means the bytes can no longer
    // travel as a raw fetch() BodyInit -- they must be base64-encoded
    // for the JSON hop, and transport-proxy.rs decodes them back to
    // raw bytes before forwarding upstream.
    configureTransportProxy(PROXY_URL)
    const mockResponse = new Response(
      JSON.stringify({ status: 200, statusText: "OK", headers: {}, body: "{}", ok: true }),
      { status: 200 }
    )
    globalThis.fetch = mock(() => Promise.resolve(mockResponse))

    const bytes = new Uint8Array([0x1f, 0x8b, 0x00, 0xff])
    const adapter = new DefaultFetchAdapter()
    await adapter.fetch({ url: "https://api.example.com/upload", method: "PUT", body: bytes })

    const [, init] = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0]
    const sent = JSON.parse((init as RequestInit).body as string)
    expect(sent.bodyEncoding).toBe("base64")
    expect(Buffer.from(sent.body, "base64")).toEqual(Buffer.from(bytes))
  })

  it("test_fetch_rejects_a_formdata_body_the_proxy_does_not_support", async () => {
    configureTransportProxy(PROXY_URL)
    const adapter = new DefaultFetchAdapter()
    const formData = new FormData()
    formData.append("field", "value")

    await expect(
      adapter.fetch({ url: "https://api.example.com/upload", method: "POST", body: formData as unknown as string })
    ).rejects.toMatchObject({ code: "unsupported_body_type" })
  })

  it("test_fetch_maps_the_proxy_response_envelope_to_fetch_response_shape", async () => {
    configureTransportProxy(PROXY_URL)
    const mockResponse = new Response(
      JSON.stringify({
        status: 404,
        statusText: "Not Found",
        headers: { "x-custom": "yes" },
        body: "plain text body",
        ok: false,
      }),
      { status: 200 }
    )
    globalThis.fetch = mock(() => Promise.resolve(mockResponse))

    const adapter = new DefaultFetchAdapter()
    const result = await adapter.fetch({ url: "https://api.example.com/missing" })

    expect(result.status).toBe(404)
    expect(result.statusText).toBe("Not Found")
    expect(result.ok).toBe(false)
    expect(result.body).toBe("plain text body")
    expect(result.headers["x-custom"]).toBe("yes")
  })

  it("test_fetch_throws_network_error_when_the_proxy_itself_returns_a_non_ok_status", async () => {
    // Distinct from an upstream 404/500 (a real FetchResponse with
    // ok:false, asserted above) -- this is transport-proxy's own
    // Handler rejecting the request (e.g. malformed body), which
    // never produced a real upstream response at all.
    configureTransportProxy(PROXY_URL)
    globalThis.fetch = mock(() => Promise.resolve(new Response("bad request", { status: 400 })))

    const adapter = new DefaultFetchAdapter()
    await expect(adapter.fetch({ url: "https://api.example.com/data" })).rejects.toMatchObject({
      code: "transport_proxy_error",
      status: 400,
    })
  })

  it("test_fetch_throws_network_error_when_the_proxy_is_unreachable", async () => {
    configureTransportProxy(PROXY_URL)
    globalThis.fetch = mock(() => Promise.reject(new TypeError("fetch failed")))

    const adapter = new DefaultFetchAdapter()
    await expect(adapter.fetch({ url: "https://api.example.com/data" })).rejects.toMatchObject({
      code: "transport_proxy_unreachable",
    })
  })

  it("test_fetch_derives_abort_signal_from_timeout_when_no_signal_given", async () => {
    configureTransportProxy(PROXY_URL)
    const mockResponse = new Response(
      JSON.stringify({ status: 200, statusText: "OK", headers: {}, body: "{}", ok: true }),
      { status: 200 }
    )
    globalThis.fetch = mock((_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      return Promise.resolve(mockResponse)
    })

    const adapter = new DefaultFetchAdapter()
    await adapter.fetch({ url: "https://api.example.com/data", timeout: 5000 })
  })
})
