import { describe, it, expect, beforeEach } from "bun:test"
import { JustJS }                            from "@justjs/application"
import { DefaultObservabilityProvider }      from "../core/default_observability.js"
import { NoopObserverContext }               from "../api/api_provider.js"

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

  it("test_factory_returns_aspect_with_noop_strategy", () => {
    const provider = new DefaultObservabilityProvider()
    const aspect   = provider.factory()
    expect(aspect.strategy).toBe("noop")
  })
})

describe("NoopObserverContext", () => {
  let ctx: NoopObserverContext

  beforeEach(() => { ctx = new NoopObserverContext() })

  it("test_logEvent_does_not_throw", () => {
    expect(() => ctx.logEvent("test")).not.toThrow()
  })

  it("test_logEvent_with_data_does_not_throw", () => {
    expect(() => ctx.logEvent("test", { key: "val" })).not.toThrow()
  })

  it("test_logError_does_not_throw", () => {
    expect(() => ctx.logError(new Error("boom"))).not.toThrow()
  })

  it("test_recordTiming_does_not_throw", () => {
    expect(() => ctx.recordTiming("operation", 42)).not.toThrow()
  })
})

describe("observability SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const justjs = JustJS.getInstance()
    const resolved = justjs.providers.resolve("observability", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("observability")
    expect(resolved!.strategy).toBe("noop")
  })
})
