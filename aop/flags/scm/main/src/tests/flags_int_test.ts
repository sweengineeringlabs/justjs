import { describe, it, expect, beforeEach } from "bun:test"
import { JustJS }                            from "@justjs/application"
import { DefaultFlagsProvider }              from "../core/default_flags.js"
import { NoopFlagsContext }                  from "../api/api_provider.js"

describe("DefaultFlagsProvider", () => {
  it("test_concern_is_flags", () => {
    const provider = new DefaultFlagsProvider()
    expect(provider.concern).toBe("flags")
  })

  it("test_strategy_is_noop", () => {
    const provider = new DefaultFlagsProvider()
    expect(provider.strategy).toBe("noop")
  })

  it("test_factory_returns_aspect_with_correct_concern", () => {
    const provider = new DefaultFlagsProvider()
    const aspect   = provider.factory()
    expect(aspect.concern).toBe("flags")
  })

  it("test_factory_returns_aspect_with_noop_strategy", () => {
    const provider = new DefaultFlagsProvider()
    const aspect   = provider.factory()
    expect(aspect.strategy).toBe("noop")
  })
})

describe("NoopFlagsContext", () => {
  let ctx: NoopFlagsContext

  beforeEach(() => { ctx = new NoopFlagsContext() })

  it("test_isEnabled_returns_false_for_any_flag", () => {
    expect(ctx.isEnabled("feature-x")).toBe(false)
    expect(ctx.isEnabled("dark-mode")).toBe(false)
  })

  it("test_getVariant_returns_null_for_any_flag", () => {
    expect(ctx.getVariant("experiment-a")).toBeNull()
    expect(ctx.getVariant("rollout")).toBeNull()
  })
})

describe("flags SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const justjs = JustJS.getInstance()
    const resolved = justjs.providers.resolve("flags", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("flags")
    expect(resolved!.strategy).toBe("noop")
  })
})
