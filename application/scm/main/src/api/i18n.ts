export interface I18nContext {
  t(key: string, params?: Record<string, unknown>): string
  locale(): string
  changeLocale(locale: string): Promise<void>
}
