import { describe, it, expect } from "bun:test"
import { DefaultApiAdapter } from "../core/api_adapter.js"
import type { FetchAdapter } from "@justjs/network"

function makeFetch(status: number, body: unknown): FetchAdapter {
  return {
    fetch: () => Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
}

describe("DefaultApiAdapter", () => {
  it("test_get_returns_parsed_json_on_200", async () => {
    const adapter = new DefaultApiAdapter(makeFetch(200, { id: 1 }), "https://api.example.com")
    const result = await adapter.get<{ id: number }>("items/1")
    expect(result).toEqual({ id: 1 })
  })

  it("test_get_returns_null_on_404", async () => {
    const adapter = new DefaultApiAdapter(makeFetch(404, null), "https://api.example.com")
    const result = await adapter.get("items/999")
    expect(result).toBeNull()
  })

  it("test_get_throws_transport_error_on_server_error", async () => {
    const adapter = new DefaultApiAdapter(makeFetch(500, null), "https://api.example.com")
    await expect(adapter.get("items/1")).rejects.toMatchObject({ code: "REQUEST_FAILED", status: 500 })
  })

  it("test_mutate_throws_transport_error_on_failure", async () => {
    const adapter = new DefaultApiAdapter(makeFetch(422, null), "https://api.example.com")
    await expect(adapter.mutate("items", { name: "x" })).rejects.toMatchObject({ code: "REQUEST_FAILED", status: 422 })
  })
})
