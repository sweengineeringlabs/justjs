import { describe, it, expect } from "bun:test"
import { InMemoryCacheAdapter } from "../core/cache_adapter.js"

describe("InMemoryCacheAdapter", () => {
  it("test_get_returns_null_for_missing_key", async () => {
    const cache = new InMemoryCacheAdapter()
    expect(await cache.get("missing")).toBeNull()
  })

  it("test_set_then_get_returns_value", async () => {
    const cache = new InMemoryCacheAdapter()
    await cache.set("key", { x: 1 })
    expect(await cache.get("key")).toEqual({ x: 1 })
  })

  it("test_invalidate_removes_entry", async () => {
    const cache = new InMemoryCacheAdapter()
    await cache.set("key", 42)
    await cache.invalidate("key")
    expect(await cache.get("key")).toBeNull()
  })

  it("test_get_returns_null_after_ttl_expires", async () => {
    const cache = new InMemoryCacheAdapter()
    await cache.set("key", "value", 1)
    await new Promise(r => setTimeout(r, 10))
    expect(await cache.get("key")).toBeNull()
  })
})
