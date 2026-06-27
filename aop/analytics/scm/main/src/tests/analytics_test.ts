import { describe, it, expect, beforeEach } from "bun:test"
import { JustJS }                            from "@justjs/application"
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
})

describe("NoopAnalyticsContext", () => {
  let ctx: NoopAnalyticsContext

  beforeEach(() => { ctx = new NoopAnalyticsContext() })

  it("test_track_does_not_throw", () => {
    expect(() => ctx.track("button_clicked", { button: "submit" })).not.toThrow()
  })

  it("test_track_without_properties_does_not_throw", () => {
    expect(() => ctx.track("page_loaded")).not.toThrow()
  })

  it("test_page_does_not_throw", () => {
    expect(() => ctx.page("home", { referrer: "/" })).not.toThrow()
  })

  it("test_identify_does_not_throw", () => {
    expect(() => ctx.identify("user-42", { plan: "pro" })).not.toThrow()
  })
})

describe("analytics SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = JustJS.providers.resolve("analytics", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("analytics")
  })
})
