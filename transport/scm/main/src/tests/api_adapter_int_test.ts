import { describe, it, expect, afterEach } from "bun:test"
import { DefaultApiAdapter } from "../core/api_adapter.js"
import { TransportError } from "../api/api_adapter.js"
import { DefaultFetchAdapter } from "@justjs/network"

describe("DefaultApiAdapter", () => {
  let server: ReturnType<typeof Bun.serve> | undefined

  afterEach(() => {
    server?.stop()
    server = undefined
  })

  it("test_get_makes_a_real_http_request_and_parses_json", async () => {
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        if (req.url.includes("/api/user/1")) {
          return new Response(JSON.stringify({ id: 1, name: "Alice" }), {
            headers: { "content-type": "application/json" },
          })
        }
        return new Response("Not found", { status: 404 })
      },
    })

    const api = new DefaultApiAdapter(new DefaultFetchAdapter())
    const result = await api.get<{ id: number; name: string }>(`http://localhost:${server.port}/api/user/1`)

    expect(result.status).toBe(200)
    expect(result.error).toBeUndefined()
    expect(result.data.id).toBe(1)
    expect(result.data.name).toBe("Alice")
  })

  it("test_post_sends_a_real_json_body_and_receives_a_real_response", async () => {
    let receivedBody: unknown
    let receivedContentType: string | null = null

    server = Bun.serve({
      port: 0,
      async fetch(req) {
        receivedContentType = req.headers.get("content-type")
        receivedBody = await req.json()
        return new Response(JSON.stringify({ created: true }), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      },
    })

    const api = new DefaultApiAdapter(new DefaultFetchAdapter())
    const result = await api.post<{ created: boolean }>(
      `http://localhost:${server.port}/api/users`,
      { name: "Bob" }
    )

    expect(result.status).toBe(201)
    expect(result.data.created).toBe(true)
    expect(receivedContentType).toBe("application/json")
    expect(receivedBody).toEqual({ name: "Bob" })
  })

  it("test_put_and_delete_make_real_requests_with_the_right_method", async () => {
    const receivedMethods: string[] = []

    server = Bun.serve({
      port: 0,
      async fetch(req) {
        receivedMethods.push(req.method)
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        })
      },
    })

    const api = new DefaultApiAdapter(new DefaultFetchAdapter())
    await api.put(`http://localhost:${server.port}/api/users/1`, { name: "Carol" })
    await api.delete(`http://localhost:${server.port}/api/users/1`)

    expect(receivedMethods).toEqual(["PUT", "DELETE"])
  })

  it("test_non_2xx_response_populates_error_instead_of_throwing", async () => {
    server = Bun.serve({
      port: 0,
      async fetch() {
        return new Response("Forbidden", { status: 403, statusText: "Forbidden" })
      },
    })

    const api = new DefaultApiAdapter(new DefaultFetchAdapter())
    const result = await api.get(`http://localhost:${server.port}/api/secret`)

    expect(result.status).toBe(403)
    expect(result.error).toBe("Forbidden")
  })

  it("test_non_json_response_body_passes_through_as_a_string", async () => {
    server = Bun.serve({
      port: 0,
      async fetch() {
        return new Response("plain text response", { headers: { "content-type": "text/plain" } })
      },
    })

    const api = new DefaultApiAdapter(new DefaultFetchAdapter())
    const result = await api.get<string>(`http://localhost:${server.port}/api/text`)

    expect(result.data).toBe("plain text response")
  })

  it("test_network_failure_is_wrapped_in_a_transport_error", async () => {
    const api = new DefaultApiAdapter(new DefaultFetchAdapter())

    await expect(api.get("http://localhost:1/unreachable")).rejects.toThrow(TransportError)
  })

  it("test_transport_error_has_code_and_status", () => {
    const error = new TransportError("API_ERROR", 500, "Server error")

    expect(error.code).toBe("API_ERROR")
    expect(error.status).toBe(500)
    expect(error.message).toBe("Server error")
  })

  it("test_transport_error_name", () => {
    const error = new TransportError("API_ERROR")

    expect(error.name).toBe("TransportError")
  })
})
