import { describe, it, expect, beforeAll, afterAll, afterEach } from "bun:test"
import { GlobalRegistrator }      from "@happy-dom/global-registrator"
import { justjs }                 from "@justjs/application"
import { TokensThemingProvider }  from "../core/tokens_theming.js"

const flush = () => new Promise((resolve) => setTimeout(resolve, 10))

describe("TokensThemingProvider", () => {
  it("test_concern_is_theming", () => {
    expect(new TokensThemingProvider().concern).toBe("theming")
  })

  it("test_strategy_is_tokens", () => {
    expect(new TokensThemingProvider().strategy).toBe("tokens")
  })

  it("test_factory_returns_aspect_with_tokens_strategy", () => {
    const aspect = new TokensThemingProvider().factory()
    expect(aspect.concern).toBe("theming")
    expect(aspect.strategy).toBe("tokens")
  })
})

describe("TokensThemingContext against a real DOM", () => {
  beforeAll(() => {
    GlobalRegistrator.register()
  })

  afterAll(async () => {
    await GlobalRegistrator.unregister()
  })

  it("test_setTheme_applies_css_variables_to_document_root", () => {
    const aspect = new TokensThemingProvider().factory({
      defaultTheme: "light",
      themes: {
        light: { "--bg": "#ffffff" },
        dark: { "--bg": "#000000" },
      },
    })
    const ctx = aspect.context()

    ctx.setTheme("dark")

    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#000000")
  })

  it("test_getTheme_reflects_current_theme_after_setTheme", () => {
    const aspect = new TokensThemingProvider().factory({
      defaultTheme: "light",
      themes: { light: { "--bg": "#fff" }, dark: { "--bg": "#000" } },
    })
    const ctx = aspect.context()

    expect(ctx.getTheme()).toBe("light")
    ctx.setTheme("dark")
    expect(ctx.getTheme()).toBe("dark")
  })

  it("test_setTheme_with_unknown_name_is_a_noop", () => {
    const aspect = new TokensThemingProvider().factory({
      defaultTheme: "light",
      themes: { light: { "--bg": "#fff" } },
    })
    const ctx = aspect.context()

    ctx.setTheme("does-not-exist")

    expect(ctx.getTheme()).toBe("light")
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#fff")
  })

  it("test_getCSSVariable_reads_applied_value_back", () => {
    const aspect = new TokensThemingProvider().factory({
      defaultTheme: "light",
      themes: { light: { "--accent": "#123456" } },
    })
    const ctx = aspect.context()

    expect(ctx.getCSSVariable("--accent")).toBe("#123456")
  })

  it("test_defaultTheme_is_applied_immediately_on_construction", () => {
    const aspect = new TokensThemingProvider().factory({
      defaultTheme: "dark",
      themes: { light: { "--bg": "#fff" }, dark: { "--bg": "#000" } },
    })
    const ctx = aspect.context()

    expect(ctx.getTheme()).toBe("dark")
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#000")
  })
})

describe("TokensThemingContext tokensUrl loading", () => {
  beforeAll(() => {
    GlobalRegistrator.register()
  })

  afterAll(async () => {
    await GlobalRegistrator.unregister()
  })

  afterEach(() => {
    // @ts-expect-error - restoring the real global after each fetch-mocking test
    delete globalThis.fetch
  })

  it("test_tokensUrl_fetch_merges_new_themes_in", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ocean: { "--bg": "#001133" } }), { status: 200 })) as typeof fetch

    const aspect = new TokensThemingProvider().factory({
      defaultTheme: "ocean",
      tokensUrl: "https://example.test/tokens.json",
    })
    const ctx = aspect.context()

    await flush()

    ctx.setTheme("ocean")
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#001133")
  })

  it("test_tokensUrl_static_themes_win_over_fetched_on_conflict", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ light: { "--bg": "from-fetch" } }), { status: 200 })) as typeof fetch

    const aspect = new TokensThemingProvider().factory({
      defaultTheme: "light",
      themes: { light: { "--bg": "from-config" } },
      tokensUrl: "https://example.test/tokens.json",
    })
    const ctx = aspect.context()

    await flush()

    ctx.setTheme("light")
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("from-config")
  })

  it("test_tokensUrl_fetch_failure_fails_soft_and_stays_usable", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch

    const aspect = new TokensThemingProvider().factory({
      defaultTheme: "light",
      themes: { light: { "--bg": "#fff" } },
      tokensUrl: "https://example.test/tokens.json",
    })
    const ctx = aspect.context()

    await flush()

    expect(ctx.getTheme()).toBe("light")
    ctx.setTheme("light")
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#fff")
  })

  it("test_tokensUrl_network_error_fails_soft_and_stays_usable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("network down")
    }) as typeof fetch

    expect(() => {
      new TokensThemingProvider().factory({
        defaultTheme: "light",
        themes: { light: { "--bg": "#fff" } },
        tokensUrl: "https://example.test/tokens.json",
      })
    }).not.toThrow()

    await flush()
  })
})

describe("theming SPI self-registration of the tokens strategy", () => {
  it("test_tokens_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = justjs.providers.resolve("theming", "tokens")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("theming")
    expect(resolved!.strategy).toBe("tokens")
  })
})
