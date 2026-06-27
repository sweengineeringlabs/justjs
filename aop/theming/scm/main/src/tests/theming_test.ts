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
})

describe("NoopThemingContext", () => {
  let ctx: NoopThemingContext

  beforeEach(() => { ctx = new NoopThemingContext() })

  it("test_active_theme_returns_default", () => {
    expect(ctx.activeTheme()).toBe("default")
  })

  it("test_tokens_returns_empty_object", () => {
    expect(ctx.tokens()).toEqual({})
  })

  it("test_set_theme_does_not_throw", () => {
    expect(() => ctx.setTheme("dark")).not.toThrow()
  })

  it("test_on_theme_change_returns_unsubscribe_function", () => {
    const unsub = ctx.onThemeChange(() => {})
    expect(typeof unsub).toBe("function")
  })

  it("test_unsubscribe_does_not_throw", () => {
    const unsub = ctx.onThemeChange(() => {})
    expect(() => unsub()).not.toThrow()
  })
})

describe("theming SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = JustJS.providers.resolve("theming", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("theming")
  })
})
