import type { AspectProvider, JustJSAspect } from "@justjs/application"

export interface UIFlagsContext {
  fetchConfig(): Promise<Record<string, unknown>>
  isEnabled(flagKey: string): boolean
  getVariant(flagKey: string): string | null
}

export interface FlagsProviderConfig {
  endpoint?: string
  refreshInterval?: number
}

export interface FlagsAspect extends JustJSAspect {
  readonly concern: "flags"
  context(): UIFlagsContext
}

export interface FlagsProvider extends AspectProvider<FlagsProviderConfig> {
  readonly concern: "flags"
}

export class NoopFlagsContext implements UIFlagsContext {
  async fetchConfig(): Promise<Record<string, unknown>> { return {} }
  isEnabled(): boolean { return false }
  getVariant(): string | null { return null }
}
