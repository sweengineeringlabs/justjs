import type { AspectProvider } from "@justjs/application"

export interface ThemingProvider extends AspectProvider {
  readonly concern: "theming"
}
