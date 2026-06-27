import type { AspectProvider, JustJSAspect, I18nContext } from "@justjs/application"

export interface I18nProviderConfig {
  defaultLocale?: string
  fallbackLocale?: string
}

export interface I18nAspect extends JustJSAspect {
  readonly concern: "i18n"
  context(): I18nContext
}

export interface I18nProvider extends AspectProvider<I18nProviderConfig> {
  readonly concern: "i18n"
}

export class NoopI18nContext implements I18nContext {
  t(key: string, _params?: Record<string, unknown>): string { return key }
  locale(): string { return "en" }
  async changeLocale(_locale: string): Promise<void> {}
}
