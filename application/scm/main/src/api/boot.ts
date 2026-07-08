import type { DomAddressMap } from "./dom-address.js"

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
