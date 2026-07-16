import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { WritableSignal } from "@justjs/data"
import { createSignal } from "@justjs/data"
import type { ThemingProviderConfig, UIThemingContext } from "../api/provider.js"

class TokensThemingContext implements UIThemingContext {
  private readonly themeSignal: WritableSignal<string>
  private themes: Record<string, Record<string, string>>

  constructor(config: ThemingProviderConfig) {
    this.themes = { ...(config.themes ?? {}) }
    const initial = config.defaultTheme ?? "light"
    this.themeSignal = createSignal(initial)

    const initialVars = this.themes[initial]
    if (initialVars) this.applyToDocument(initialVars)

    if (config.tokensUrl) void this.loadTokens(config.tokensUrl, initial)
  }

  private async loadTokens(url: string, initialTheme: string): Promise<void> {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`tokensUrl fetch failed: ${response.status}`)
      const loaded = (await response.json()) as Record<string, Record<string, string>>
      // static config.themes wins over fetched entries on a name conflict
      this.themes = { ...loaded, ...this.themes }

      const currentVars = this.themes[this.themeSignal.value]
      if (currentVars && this.themeSignal.value === initialTheme) this.applyToDocument(currentVars)
    } catch {
      // fail soft - the context stays usable on whatever themes/CSS state
      // is already applied from the static `themes` config
    }
  }

  private applyToDocument(vars: Record<string, string>): void {
    if (typeof document === "undefined") return
    for (const [name, value] of Object.entries(vars)) {
      document.documentElement.style.setProperty(name, value)
    }
  }

  getTheme(): string { return this.themeSignal.value }

  setTheme(theme: string): void {
    const vars = this.themes[theme]
    if (!vars) return
    this.applyToDocument(vars)
    this.themeSignal.value = theme
  }

  getCSSVariable(varName: string): string | null {
    if (typeof document === "undefined") return null
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    return value.length > 0 ? value : null
  }
}

class TokensThemingAspect implements JustJSAspect {
  readonly concern = "theming" as const
  readonly strategy = "tokens" as const
  private readonly ctx: TokensThemingContext

  constructor(config: ThemingProviderConfig) {
    this.ctx = new TokensThemingContext(config)
  }

  context() { return this.ctx }
  weave(_target: AspectTarget): void {}
}

export class TokensThemingProvider {
  readonly concern = "theming" as const
  readonly strategy = "tokens" as const
  factory(config?: ThemingProviderConfig): TokensThemingAspect {
    return new TokensThemingAspect(config ?? {})
  }
}
