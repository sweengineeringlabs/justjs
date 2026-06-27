import type { AspectDeclaration } from "./aspect.js"

export interface RoutesManifest {
  version: number
  routes:  Array<{ path: string; componentId: string; featureId: string }>
}

export interface RegistryManifest {
  components: Array<{ id: string; tagName: string }>
}

export interface ImportMap {
  version: number
  imports: Record<string, string>
}

export interface DdasMap {
  app:       string
  version:   string
  schema:    string
  elements:  Record<string, ElementDescriptor>
  slots?:    Record<string, SlotDescriptor>
}

export interface ElementDescriptor {
  id:        string
  component: string
  feature:   string
  element:   string
}

export interface SlotDescriptor {
  id:     string
  parent: string
}

export interface BootConfig {
  readonly routes:    RoutesManifest
  readonly importmap: ImportMap
  readonly registry:  RegistryManifest
  readonly domMap:    DdasMap

  readonly security?:      AspectDeclaration
  readonly observability?:  AspectDeclaration
  readonly i18n?:           AspectDeclaration
  readonly flags?:          AspectDeclaration
  readonly analytics?:      AspectDeclaration
  readonly theming?:        AspectDeclaration

  readonly aspects?: AspectDeclaration[]
}

export type BootErrorCode =
  | "UNKNOWN_STRATEGY"
  | "UNKNOWN_ROUTE"
  | "UNKNOWN_COMPONENT"
  | "INVALID_DDAS_ADDRESS"
  | "ARTIFACT_VERSION_MISMATCH"

export interface BootError extends Error {
  readonly code:     BootErrorCode
  readonly received: string
  readonly known:    string[]
  readonly nearest?: string
}
