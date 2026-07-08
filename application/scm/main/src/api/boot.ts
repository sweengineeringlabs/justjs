import type { DomAddressMap } from "./dom-address.js"
import type { ComponentRegistry, LazyCustomElementRegistry } from "./registry.js"
import type { RuntimeAdapter } from "./component.js"
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
  // apiAdapter defaults to a real DefaultApiAdapter/DefaultFetchAdapter pair
  // rather than requiring every caller to construct one by hand.
  readonly componentRegistry?: LazyCustomElementRegistry | ComponentRegistry
  readonly runtimeAdapter?: RuntimeAdapter
  readonly apiAdapter?: ApiAdapter

  // ADR-0003 D8: shared data-layer access threaded into every
  // ComponentContext DefaultRouter builds. Unlike apiAdapter, no default
  // instance is constructed when omitted — an app with no shared state
  // shouldn't pay for a DefaultFeatureStore it never uses.
  readonly featureStore?: FeatureStore
  readonly eventBus?: UIEventBus

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
