import { describe, it, expect, beforeEach } from "bun:test"
import { JustJS }                             from "@justjs/application"
import { DefaultObservabilityProvider }       from "../core/default_observability.js"
import { NoopObserverContext, NoopLogDrain }  from "../api/provider.js"

describe("DefaultObservabilityProvider", () => {
  it("test_concern_is_observability", () => {
    const provider = new DefaultObservabilityProvider()
    expect(provider.concern).toBe("observability")
  })

  it("test_strategy_is_noop", () => {
    const provider = new DefaultObservabilityProvider()
    expect(provider.strategy).toBe("noop")
  })

  it("test_factory_returns_aspect_with_correct_concern", () => {
    const provider = new DefaultObservabilityProvider()
    const aspect   = provider.factory()
    expect(aspect.concern).toBe("observability")
  })
})

describe("NoopObserverContext", () => {
  let ctx: NoopObserverContext

  beforeEach(() => { ctx = new NoopObserverContext() })

  it("test_mark_does_not_throw", () => {
    expect(() => ctx.mark("start")).not.toThrow()
  })

  it("test_measure_does_not_throw", () => {
    expect(() => ctx.measure("duration", "start")).not.toThrow()
  })

  it("test_on_error_returns_unsubscribe_function", () => {
    const unsub = ctx.onError(() => {})
    expect(typeof unsub).toBe("function")
  })

  it("test_drain_returns_log_drain", () => {
    const drain = ctx.drain()
    expect(drain).toBeInstanceOf(NoopLogDrain)
  })
})

describe("NoopLogDrain", () => {
  it("test_info_does_not_throw", () => {
    const drain = new NoopLogDrain()
    expect(() => drain.info("msg", { key: "val" })).not.toThrow()
  })

  it("test_warn_does_not_throw", () => {
    const drain = new NoopLogDrain()
    expect(() => drain.warn("msg")).not.toThrow()
  })

  it("test_error_does_not_throw_with_error_object", () => {
    const drain = new NoopLogDrain()
    expect(() => drain.error("boom", new Error("err"))).not.toThrow()
  })
})

describe("observability SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = JustJS.providers.resolve("observability", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("observability")
  })
})
