import type { AspectProvider } from "@justjs/application"

export interface SecurityProvider extends AspectProvider {
  readonly concern: "security"
}
