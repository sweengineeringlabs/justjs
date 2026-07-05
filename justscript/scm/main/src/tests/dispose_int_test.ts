import { describe, it, expect } from "bun:test"
import { makeDisposable }      from "../core/dispose.js"
import { makeAsyncDisposable } from "../core/async_dispose.js"

describe("makeDisposable()", () => {
  it("test_make_disposable_on_dispose_calls_cleanup", () => {
    let cleaned = false
    const res = makeDisposable({ name: "conn" }, () => { cleaned = true })
    res[Symbol.dispose]()
    expect(cleaned).toBe(true)
  })

  it("test_make_disposable_on_dispose_receives_original_resource", () => {
    let received: string | undefined
    const resource = { name: "db" }
    const res = makeDisposable(resource, r => { received = r.name })
    res[Symbol.dispose]()
    expect(received).toBe("db")
  })

  it("test_make_disposable_with_using_keyword_calls_cleanup_at_scope_exit", () => {
    let cleaned = false
    {
      using res = makeDisposable({ id: 1 }, () => { cleaned = true })
      void res
      expect(cleaned).toBe(false)
    }
    expect(cleaned).toBe(true)
  })
})

describe("makeAsyncDisposable()", () => {
  it("test_make_async_disposable_on_async_dispose_calls_cleanup", async () => {
    let cleaned = false
    const res = makeAsyncDisposable({ name: "stream" }, async () => { cleaned = true })
    await res[Symbol.asyncDispose]()
    expect(cleaned).toBe(true)
  })

  it("test_make_async_disposable_with_await_using_keyword_calls_cleanup_at_scope_exit", async () => {
    let cleaned = false
    {
      await using res = makeAsyncDisposable({ id: 2 }, async () => { cleaned = true })
      void res
      expect(cleaned).toBe(false)
    }
    expect(cleaned).toBe(true)
  })
})
