import type { AspectProvider, JustJSAspect } from "@justjs/application"

export interface UIThemingContext {
  getTheme(): string
  setTheme(theme: string): void
  getCSSVariable(varName: string): string | null
}

export interface ThemingProviderConfig {
  defaultTheme?: string
  themes?: Record<string, Record<string, string>>
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
