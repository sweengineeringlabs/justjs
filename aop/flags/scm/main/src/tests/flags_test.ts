import { describe, it, expect, beforeEach } from "bun:test"
import { JustJS }                            from "@justjs/application"
import { DefaultFlagsProvider }              from "../core/default_flags.js"
import { NoopFlagsContext }                  from "../api/provider.js"

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
})

describe("NoopFlagsContext", () => {
  let ctx: NoopFlagsContext

  beforeEach(() => { ctx = new NoopFlagsContext() })

  it("test_is_enabled_returns_false_for_any_flag", () => {
    expect(ctx.isEnabled("feature-x")).toBe(false)
    expect(ctx.isEnabled("dark-mode")).toBe(false)
  })

  it("test_variant_returns_null_for_any_flag", () => {
    expect(ctx.variant<string>("experiment-a")).toBeNull()
    expect(ctx.variant<number>("rollout")).toBeNull()
  })
})

describe("flags SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = JustJS.providers.resolve("flags", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("flags")
  })
})
