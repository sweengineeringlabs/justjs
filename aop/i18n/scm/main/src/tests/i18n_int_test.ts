import { describe, it, expect, beforeEach } from "bun:test"
import { justjs }                            from "@justjs/application"
import { DefaultI18nProvider }               from "../core/default_i18n.js"
import { NoopI18nContext }                   from "../api/provider.js"

describe("DefaultI18nProvider", () => {
  it("test_concern_is_i18n", () => {
    const provider = new DefaultI18nProvider()
    expect(provider.concern).toBe("i18n")
  })

  it("test_strategy_is_noop", () => {
    const provider = new DefaultI18nProvider()
    expect(provider.strategy).toBe("noop")
  })

  it("test_factory_returns_aspect_with_correct_concern", () => {
    const provider = new DefaultI18nProvider()
    const aspect   = provider.factory()
    expect(aspect.concern).toBe("i18n")
  })

  it("test_factory_returns_aspect_with_noop_strategy", () => {
    const provider = new DefaultI18nProvider()
    const aspect   = provider.factory()
    expect(aspect.strategy).toBe("noop")
  })
})

describe("NoopI18nContext", () => {
  let ctx: NoopI18nContext

  beforeEach(() => { ctx = new NoopI18nContext() })

  it("test_translate_returns_key_as_fallback", () => {
    expect(ctx.translate("greeting.hello")).toBe("greeting.hello")
  })

  it("test_translate_with_params_returns_key", () => {
    expect(ctx.translate("user.name", { name: "Alice" })).toBe("user.name")
  })

  it("test_getLocale_returns_en_default", () => {
    expect(ctx.getLocale()).toBe("en")
  })

  it("test_setLocale_does_not_throw", () => {
    expect(() => ctx.setLocale("fr")).not.toThrow()
  })
})

describe("i18n SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = justjs.providers.resolve("i18n", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("i18n")
    expect(resolved!.strategy).toBe("noop")
  })
})
