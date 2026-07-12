import type { DomAddressMap } from "./dom-address.js"
import type { ComponentRegistry, LazyCustomElementRegistry, Router } from "./registry.js"
import type { RuntimeAdapter } from "./component.js"
import type { Lifecycle } from "./lifecycle.js"
import type { ErrorBoundary } from "./error_boundary.js"
import type { ApiAdapter } from "@justjs/transport"
import type { FeatureStore, UIEventBus } from "@justjs/data"

export interface RouteConfig {
  readonly on?: readonly string[]
  readonly except?: readonly string[]
}

export interface ComponentConfig {
  readonly on?: readonly string[]
  readonly except?: readonly string[]
}

export interface AspectConfig {
  readonly strategy: string
  readonly routes?: RouteConfig
  readonly components?: ComponentConfig
  // Forwarded verbatim to the resolved strategy's AspectProviderSpec.factory()
  // as its sole argument - e.g. an API key, a default theme, or any other
  // per-strategy setup a provider's factory(config?) signature already
  // accepted but boot() never actually passed through. Untyped here
  // (BootConfig itself is untyped per-concern) since each concern's real
  // config shape (SecurityProviderConfig, ThemingProviderConfig,
  // AiAssistProviderConfig, ...) lives in that package's own api/, not here.
  readonly config?: unknown
}

export interface DdasEnforcement {
  readonly enabled?: boolean
  readonly onMissing?: "warn" | "error" | "ignore"
}

export interface BootConfig {
  readonly routes?: readonly string[]
  readonly registry?: Record<string, unknown>
  readonly importmap?: Record<string, unknown>
  readonly domAddressMap?: DomAddressMap
  readonly providers?: Record<string, unknown>
  readonly aspects?: Record<string, AspectConfig>
  readonly ddasEnforcement?: DdasEnforcement

  // Runtime composition — what boot() actually builds after validation
  // passes (ADR-0002 D4). All optional: an app with no component registry
  // gets no working Lifecycle/Router either (nothing to render), and
  // apiAdapter defaults to a real transport/network adapter pair (built via
  // their saf factories) rather than requiring every caller to construct
  // one by hand.
  readonly componentRegistry?: LazyCustomElementRegistry | ComponentRegistry
  readonly runtimeAdapter?: RuntimeAdapter
  readonly apiAdapter?: ApiAdapter

  // ADR-0003 D8: shared data-layer access threaded into every
  // ComponentContext DefaultRouter builds. Unlike apiAdapter, no default
  // instance is constructed when omitted — an app with no shared state
  // shouldn't pay for a FeatureStore it never uses.
  readonly featureStore?: FeatureStore
  readonly eventBus?: UIEventBus

  // Contains a component render()/update() failure to that component
  // instead of letting it propagate as an unhandled rejection out of
  // navigate()/a reactive re-render (ADR-0004). Optional: with none
  // supplied, a component error still throws exactly as it always has -
  // no behavior change for a caller that hasn't opted in.
  readonly errorBoundary?: ErrorBoundary

  readonly [key: string]: unknown
}

export class BootError extends Error {
  constructor(
    readonly code: string,
    readonly received?: string,
    readonly known?: string[],
    readonly nearest?: string,
    message?: string
  ) {
    super(message ?? `Boot failed: ${code}`)
    this.name = "BootError"
  }
}

export interface JustJSBoot {
  boot(config: BootConfig): Promise<void>
}

// A single registered strategy: which concern it serves, under what
// strategy name, and the factory a provider's spi/index.ts self-registers
// to build a real JustJSAspect on demand.
export interface AspectProviderSpec {
  readonly concern: string
  readonly strategy: string
  readonly factory: (config?: any) => unknown
}

export interface JustJSProviderRegistry {
  register(spec: AspectProviderSpec): void
  get(concern: string, strategy: string): AspectProviderSpec | undefined
  resolve(concern: string, strategy: string): AspectProviderSpec | null
  has(concern: string, strategy: string): boolean
  strategiesFor(concern: string): string[]
  clear(): void
}

// The full public shape of the `justjs` singleton - what saf/index.ts
// exports it as, instead of the concrete JustJS class (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml). Everything boot() builds
// (ADR-0002 D4) is undefined until boot() has actually run.
export interface JustJSInstance extends JustJSBoot {
  readonly providers: JustJSProviderRegistry
  clearProviders(): void
  readonly apiAdapter: ApiAdapter | undefined
  readonly componentRegistry: ComponentRegistry | undefined
  readonly lifecycle: Lifecycle | undefined
  readonly router: Router | undefined
}
