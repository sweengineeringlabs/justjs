import type { AspectProvider, JustJSAspect } from "@justjs/application"

export interface UIi18nContext {
  loadLocaleFile(locale: string): Promise<Record<string, string>>
  translate(key: string, params?: Record<string, unknown>): string
  getLocale(): string
  setLocale(locale: string): void
}

export interface I18nProviderConfig {
  defaultLocale?: string
  messages?: Record<string, Record<string, string>>
}

export interface I18nAspect extends JustJSAspect {
  readonly concern: "i18n"
  context(): UIi18nContext
}

export interface I18nProvider extends AspectProvider<I18nProviderConfig> {
  readonly concern: "i18n"
}

export class NoopI18nContext implements UIi18nContext {
  async loadLocaleFile(): Promise<Record<string, string>> { return {} }
  translate(key: string): string { return key }
  getLocale(): string { return "en" }
  setLocale(): void {}
}
