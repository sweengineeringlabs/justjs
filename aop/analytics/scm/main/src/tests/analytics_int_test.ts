import { describe, it, expect, beforeEach } from "bun:test"
import { justjs }                            from "@justjs/application"
import { DefaultAnalyticsProvider }          from "../core/default_analytics.js"
import { NoopAnalyticsContext }              from "../api/provider.js"

describe("DefaultAnalyticsProvider", () => {
  it("test_concern_is_analytics", () => {
    const provider = new DefaultAnalyticsProvider()
    expect(provider.concern).toBe("analytics")
  })

  it("test_strategy_is_noop", () => {
    const provider = new DefaultAnalyticsProvider()
    expect(provider.strategy).toBe("noop")
  })

  it("test_factory_returns_aspect_with_correct_concern", () => {
    const provider = new DefaultAnalyticsProvider()
    const aspect   = provider.factory()
    expect(aspect.concern).toBe("analytics")
  })

  it("test_factory_returns_aspect_with_noop_strategy", () => {
    const provider = new DefaultAnalyticsProvider()
    const aspect   = provider.factory()
    expect(aspect.strategy).toBe("noop")
  })
})

describe("NoopAnalyticsContext", () => {
  let ctx: NoopAnalyticsContext

  beforeEach(() => { ctx = new NoopAnalyticsContext() })

  it("test_trackEvent_does_not_throw", () => {
    expect(() => ctx.trackEvent("button_clicked", { button: "submit" })).not.toThrow()
  })

  it("test_trackEvent_without_properties_does_not_throw", () => {
    expect(() => ctx.trackEvent("page_loaded")).not.toThrow()
  })

  it("test_trackPage_does_not_throw", () => {
    expect(() => ctx.trackPage("/home", { referrer: "/" })).not.toThrow()
  })

  it("test_trackPage_without_properties_does_not_throw", () => {
    expect(() => ctx.trackPage("/products")).not.toThrow()
  })
})

describe("analytics SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = justjs.providers.resolve("analytics", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("analytics")
    expect(resolved!.strategy).toBe("noop")
  })
})
