import type { AspectProvider, JustJSAspect } from "@justjs/application"

export interface ThemeTokens {
  readonly [key: string]: string
}

export interface ThemingContext {
  activeTheme(): string
  tokens(): ThemeTokens
  setTheme(name: string): void
  onThemeChange(fn: (theme: string) => void): () => void
}

export interface ThemingProviderConfig {
  defaultTheme?: string
  themes?: Record<string, ThemeTokens>
}

export interface ThemingAspect extends JustJSAspect {
  readonly concern: "theming"
  context(): ThemingContext
}

export interface ThemingProvider extends AspectProvider<ThemingProviderConfig> {
  readonly concern: "theming"
}

export class NoopThemingContext implements ThemingContext {
  activeTheme(): string { return "default" }
  tokens(): ThemeTokens { return {} }
  setTheme(_name: string): void {}
  onThemeChange(_fn: (theme: string) => void): () => void { return () => {} }
}
