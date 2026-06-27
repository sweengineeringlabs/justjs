import type { AspectProvider } from "@justjs/application"

export interface ObservabilityProvider extends AspectProvider {
  readonly concern: "observability"
}
