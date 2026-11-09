import type { AspectProvider, JustJSAspect } from "@justjs/application"

export interface UIThemingContext {
  getTheme(): string
  setTheme(theme: string): void
  getCSSVariable(varName: string): string | null
}

export interface ThemingProviderConfig {
  defaultTheme?: string
  themes?: Record<string, Record<string, string>>
  /** URL to fetch additional themes (same shape as `themes`) from at boot.
   *  Entries in `themes` win over fetched ones on a name conflict. A failed
   *  fetch fails soft — the context stays usable on `themes` alone. */
  tokensUrl?: string
}

export interface ThemingAspect extends JustJSAspect {
  readonly concern: "theming"
  context(): UIThemingContext
}

export interface ThemingProvider extends AspectProvider<ThemingProviderConfig> {
  readonly concern: "theming"
}

export class NoopThemingContext implements UIThemingContext {
  getTheme(): string { return "light" }
  setTheme(): void {}
  getCSSVariable(): string | null { return null }
}
