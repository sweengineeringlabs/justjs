import { describe, it, expect, beforeEach } from "bun:test"
import { JustJS }                            from "@justjs/application"
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
})

describe("NoopI18nContext", () => {
  let ctx: NoopI18nContext

  beforeEach(() => { ctx = new NoopI18nContext() })

  it("test_t_returns_key_as_translation_when_no_catalog", () => {
    expect(ctx.t("greeting.hello")).toBe("greeting.hello")
  })

  it("test_t_returns_key_even_with_params", () => {
    expect(ctx.t("user.name", { name: "Alice" })).toBe("user.name")
  })

  it("test_locale_returns_en_as_default", () => {
    expect(ctx.locale()).toBe("en")
  })

  it("test_change_locale_does_not_throw", async () => {
    await expect(ctx.changeLocale("fr")).resolves.toBeUndefined()
  })
})

describe("i18n SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = JustJS.providers.resolve("i18n", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("i18n")
  })
})
