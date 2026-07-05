import { describe, it, expect, beforeEach } from "bun:test"
import { JustJS }                            from "@justjs/application"
import { DefaultThemingProvider }            from "../core/default_theming.js"
import { NoopThemingContext }                from "../api/provider.js"

describe("DefaultThemingProvider", () => {
  it("test_concern_is_theming", () => {
    const provider = new DefaultThemingProvider()
    expect(provider.concern).toBe("theming")
  })

  it("test_strategy_is_noop", () => {
    const provider = new DefaultThemingProvider()
    expect(provider.strategy).toBe("noop")
  })

  it("test_factory_returns_aspect_with_correct_concern", () => {
    const provider = new DefaultThemingProvider()
    const aspect   = provider.factory()
    expect(aspect.concern).toBe("theming")
  })

  it("test_factory_returns_aspect_with_noop_strategy", () => {
    const provider = new DefaultThemingProvider()
    const aspect   = provider.factory()
    expect(aspect.strategy).toBe("noop")
  })
})

describe("NoopThemingContext", () => {
  let ctx: NoopThemingContext

  beforeEach(() => { ctx = new NoopThemingContext() })

  it("test_getTheme_returns_light_default", () => {
    expect(ctx.getTheme()).toBe("light")
  })

  it("test_setTheme_does_not_throw", () => {
    expect(() => ctx.setTheme("dark")).not.toThrow()
  })

  it("test_getCSSVariable_returns_null", () => {
    expect(ctx.getCSSVariable("--primary-color")).toBeNull()
    expect(ctx.getCSSVariable("--bg-color")).toBeNull()
  })

  it("test_getCSSVariable_with_any_var_name_returns_null", () => {
    expect(ctx.getCSSVariable("custom-var")).toBeNull()
  })
})

describe("theming SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const justjs = JustJS.getInstance()
    const resolved = justjs.providers.resolve("theming", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("theming")
    expect(resolved!.strategy).toBe("noop")
  })
})
