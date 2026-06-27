import type { AspectProvider } from "@justjs/application"

export interface I18nProvider extends AspectProvider {
  readonly concern: "i18n"
}
