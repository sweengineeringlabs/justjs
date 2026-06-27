import type { AspectProvider } from "@justjs/application"

export interface AnalyticsProvider extends AspectProvider {
  readonly concern: "analytics"
}
