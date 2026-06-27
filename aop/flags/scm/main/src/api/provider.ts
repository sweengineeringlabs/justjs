import type { AspectProvider, JustJSAspect, FlagsContext } from "@justjs/application"

export interface FlagsProviderConfig {
  endpoint?: string
  pollingIntervalMs?: number
}

export interface FlagsAspect extends JustJSAspect {
  readonly concern: "flags"
  context(): FlagsContext
}

export interface FlagsProvider extends AspectProvider<FlagsProviderConfig> {
  readonly concern: "flags"
}

export class NoopFlagsContext implements FlagsContext {
  isEnabled(_flag: string): boolean { return false }
  variant<T>(_flag: string): T | null { return null }
}
