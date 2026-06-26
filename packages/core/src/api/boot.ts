import type { AspectDeclaration } from "./aspect.js"

export interface RoutesManifest {
  routes: Array<{ path: string; componentId: string; featureId: string }>
}

export interface RegistryManifest {
  components: Array<{ id: string; tagName: string }>
}

export interface ImportMap {
  imports: Record<string, string>
}

export interface BootConfig {
  readonly routes:    RoutesManifest
  readonly importmap: ImportMap
  readonly registry:  RegistryManifest

  // Aspects — all optional, declared by strategy name, never by import
  readonly security?:      AspectDeclaration
  readonly observability?:  AspectDeclaration
  readonly transport?:      AspectDeclaration
  readonly i18n?:           AspectDeclaration
  readonly flags?:          AspectDeclaration
  readonly errorHandling?:  AspectDeclaration
  readonly analytics?:      AspectDeclaration
  readonly theming?:        AspectDeclaration

  // Custom aspects — open SPI contract
  readonly aspects?: AspectDeclaration[]

  // Mount target selector
  readonly mount?: string
}

export interface BootError extends Error {
  readonly code:     "UNKNOWN_STRATEGY" | "UNKNOWN_ROUTE" | "UNKNOWN_COMPONENT"
  readonly received: string
  readonly known:    string[]
  readonly nearest?: string
}
