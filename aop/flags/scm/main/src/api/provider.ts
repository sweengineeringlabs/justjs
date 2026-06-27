import type { AspectProvider } from "@justjs/application"

export interface FlagsProvider extends AspectProvider {
  readonly concern: "flags"
}
