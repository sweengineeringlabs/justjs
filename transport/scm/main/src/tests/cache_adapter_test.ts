import { describe, it, expect } from "bun:test"
import { DefaultCacheAdapter } from "../core/cache_adapter.js"

describe("cache adapter", () => {
  it("test_cache_get_nonexistent_returns_null", async () => {
    const cache = new DefaultCacheAdapter()

    const result = await cache.get("missing")

    expect(result).toBeNull()
  })

  it("test_cache_set_and_get", async () => {
    const cache = new DefaultCacheAdapter()

    await cache.set("key", { data: "value" })
    const result = await cache.get("key")

    expect(result).toEqual({ data: "value" })
  })

  it("test_cache_delete", async () => {
    const cache = new DefaultCacheAdapter()

    await cache.set("key", { data: "value" })
    await cache.delete("key")
    const result = await cache.get("key")

    expect(result).toBeNull()
  })

  it("test_cache_clear", async () => {
    const cache = new DefaultCacheAdapter()

    await cache.set("key1", "value1")
    await cache.set("key2", "value2")
    await cache.clear()

    const result1 = await cache.get("key1")
    const result2 = await cache.get("key2")

    expect(result1).toBeNull()
    expect(result2).toBeNull()
  })

  it("test_cache_expiration", async () => {
    const cache = new DefaultCacheAdapter()

    await cache.set("key", "value", 100)
    await new Promise((r) => setTimeout(r, 150))
    const result = await cache.get("key")

    expect(result).toBeNull()
  })
})
