import type { BootConfig, JustJSBoot } from "../api/boot.js"
import { BootError } from "../api/boot.js"

class BootValidator {
  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = Array.from({ length: b.length + 1 }, () => [])
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1
        matrix[i]![j] = Math.min(
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1,
          matrix[i - 1]![j - 1]! + cost
        )
      }
    }
    return matrix[b.length]![a.length]!
  }

  private findNearest(target: string, candidates: string[]): string | undefined {
    if (candidates.length === 0) return undefined
    let nearest = candidates[0]!
    let minDistance = this.levenshtein(target, nearest)
    for (const candidate of candidates.slice(1)) {
      const distance = this.levenshtein(target, candidate)
      if (distance < minDistance) {
        minDistance = distance
        nearest = candidate
      }
    }
    return minDistance < 3 ? nearest : undefined
  }

  validate(config: BootConfig, justjs: JustJS): void {
    // Check for missing required config
    if (!config.routes) {
      throw new BootError("MISSING_ROUTES")
    }
    if (!config.registry) {
      throw new BootError("MISSING_REGISTRY")
    }

    const routes = config.routes as readonly unknown[]
    const registry = config.registry as Record<string, any>
    const domAddressMap = config.domAddressMap as Record<string, readonly string[]> | undefined
    const aspects = config.aspects as Record<string, any> | undefined

    // Validate routes format
    const validRoutes: string[] = []
    for (const route of routes) {
      if (typeof route !== "string") {
        throw new BootError(
          "INVALID_ROUTE_TYPE",
          String(route),
          [],
          undefined,
          `Route must be a string, got ${typeof route}`
        )
      }
      if (!route.startsWith("/")) {
        throw new BootError(
          "INVALID_ROUTE_FORMAT",
          route,
          validRoutes,
          undefined,
          `Route must start with '/', got "${route}"`
        )
      }
      validRoutes.push(route)
    }

    // Check for duplicate routes
    const uniqueRoutes = new Set(validRoutes)
    if (uniqueRoutes.size !== validRoutes.length) {
      const duplicates = validRoutes.filter((r, i) => validRoutes.indexOf(r) !== i)
      throw new BootError(
        "DUPLICATE_ROUTES",
        duplicates[0],
        Array.from(uniqueRoutes),
        undefined,
        `Duplicate routes found: ${duplicates.join(", ")}`
      )
    }

    // Validate registry format
    const registryEntries = Object.entries(registry)
    for (const [tag, entry] of registryEntries) {
      if (!entry || typeof entry !== "object") {
        throw new BootError(
          "INVALID_REGISTRY_ENTRY",
          tag,
          [],
          undefined,
          `Registry entry "${tag}" must be an object`
        )
      }
      if (!("path" in entry)) {
        throw new BootError(
          "MISSING_REGISTRY_PATH",
          tag,
          [],
          undefined,
          `Registry entry "${tag}" missing required field "path"`
        )
      }
      if (!("component" in entry)) {
        throw new BootError(
          "MISSING_REGISTRY_COMPONENT",
          tag,
          [],
          undefined,
          `Registry entry "${tag}" missing required field "component"`
        )
      }
      if (typeof entry.path !== "string") {
        throw new BootError(
          "INVALID_REGISTRY_PATH_TYPE",
          tag,
          [],
          undefined,
          `Registry entry "${tag}" path must be a string, got ${typeof entry.path}`
        )
      }
    }

    // Check route-registry mapping: every route must have a registry entry
    for (const route of validRoutes) {
      const registryEntry = registryEntries.find(([, entry]) => entry.path === route)
      if (!registryEntry) {
        const registryPaths = registryEntries.map(([, entry]) => entry.path as string)
        const nearest = this.findNearest(route, registryPaths)
        throw new BootError(
          "ROUTE_NOT_IN_REGISTRY",
          route,
          registryPaths,
          nearest,
          `Route "${route}" not found in registry${nearest ? ` (did you mean "${nearest}"?)` : ""}`
        )
      }
    }

    // Check route-registry mapping: every registry entry must have a route
    for (const [tag, entry] of registryEntries) {
      if (!validRoutes.includes(entry.path)) {
        const nearest = this.findNearest(entry.path, validRoutes)
        throw new BootError(
          "REGISTRY_NOT_IN_ROUTES",
          entry.path,
          validRoutes,
          nearest,
          `Registry entry "${tag}" path "${entry.path}" not found in routes${nearest ? ` (did you mean "${nearest}"?)` : ""}`
        )
      }
    }

    // AC 4: Validate DDAS entries if provided
    if (domAddressMap) {
      for (const [tag] of registryEntries) {
        if (!(tag in domAddressMap)) {
          const known = Object.keys(domAddressMap)
          throw new BootError(
            "MISSING_DDAS_ENTRY",
            tag,
            known,
            undefined,
            `Component tag "${tag}" missing DDAS entry in dom-address-map`
          )
        }
      }
    }

    // AC 1: Validate providers registered in JustJS.providers
    if (aspects) {
      for (const [concern, aspectConfig] of Object.entries(aspects)) {
        // Check for strategy references in aspect config
        if (typeof aspectConfig === "string") {
          const strategy = aspectConfig
          if (!justjs.providers.has(concern, strategy)) {
            // Find all registered strategies for this concern to suggest alternatives
            const allRegistered = justjs.providers.strategiesFor(concern)
            const nearest = this.findNearest(strategy, allRegistered)
            throw new BootError(
              "PROVIDER_NOT_REGISTERED",
              strategy,
              allRegistered,
              nearest,
              `Aspect "${concern}" references provider strategy "${strategy}" which is not registered in JustJS.providers${nearest ? ` (did you mean "${nearest}"?)` : ""}`
            )
          }
        }
      }
    }

    // AC 2 & 3: Validate aspect routes and components
    if (aspects) {
      const registryTags = Object.keys(registry)
      for (const [aspectName, aspectConfig] of Object.entries(aspects)) {
        if (aspectConfig.routes) {
          // Check .on() routes
          if (aspectConfig.routes.on) {
            for (const route of aspectConfig.routes.on) {
              if (!validRoutes.includes(route)) {
                const nearest = this.findNearest(route, validRoutes)
                throw new BootError(
                  "ASPECT_ROUTE_NOT_FOUND",
                  route,
                  validRoutes,
                  nearest,
                  `Aspect "${aspectName}" .on([]) contains route "${route}" which not in routes${nearest ? ` (did you mean "${nearest}"?)` : ""}`
                )
              }
            }
          }
          // Check .except() routes
          if (aspectConfig.routes.except) {
            for (const route of aspectConfig.routes.except) {
              if (!validRoutes.includes(route)) {
                const nearest = this.findNearest(route, validRoutes)
                throw new BootError(
                  "ASPECT_ROUTE_NOT_FOUND",
                  route,
                  validRoutes,
                  nearest,
                  `Aspect "${aspectName}" .except([]) contains route "${route}" which not in routes${nearest ? ` (did you mean "${nearest}"?)` : ""}`
                )
              }
            }
          }
        }

        if (aspectConfig.components) {
          // Check .on() components
          if (aspectConfig.components.on) {
            for (const tag of aspectConfig.components.on) {
              if (!registryTags.includes(tag)) {
                const nearest = this.findNearest(tag, registryTags)
                throw new BootError(
                  "ASPECT_COMPONENT_NOT_FOUND",
                  tag,
                  registryTags,
                  nearest,
                  `Aspect "${aspectName}" .on([]) contains component "${tag}" which is not registered${nearest ? ` (did you mean "${nearest}"?)` : ""}`
                )
              }
            }
          }
          // Check .except() components
          if (aspectConfig.components.except) {
            for (const tag of aspectConfig.components.except) {
              if (!registryTags.includes(tag)) {
                const nearest = this.findNearest(tag, registryTags)
                throw new BootError(
                  "ASPECT_COMPONENT_NOT_FOUND",
                  tag,
                  registryTags,
                  nearest,
                  `Aspect "${aspectName}" .except([]) contains component "${tag}" which is not registered${nearest ? ` (did you mean "${nearest}"?)` : ""}`
                )
              }
            }
          }
        }
      }
    }
  }
}

export interface AspectProviderSpec {
  readonly concern: string
  readonly strategy: string
  readonly factory: (config?: unknown) => unknown
}

export class JustJS implements JustJSBoot {
  private static instance: JustJS | null = null
  private validator = new BootValidator()
  private registeredStrategies = new Map<string, AspectProviderSpec>()

  static getInstance(): JustJS {
    if (!JustJS.instance) {
      JustJS.instance = new JustJS()
    }
    return JustJS.instance
  }

  private getProvidersRegistry = () => ({
    register: (spec: AspectProviderSpec): void => {
      const key = `${spec.concern}:${spec.strategy}`
      this.registeredStrategies.set(key, spec)
    },
    get: (concern: string, strategy: string): AspectProviderSpec | undefined => {
      const key = `${concern}:${strategy}`
      return this.registeredStrategies.get(key)
    },
    resolve: (concern: string, strategy: string): AspectProviderSpec | null => {
      const key = `${concern}:${strategy}`
      return this.registeredStrategies.get(key) ?? null
    },
    has: (concern: string, strategy: string): boolean => {
      const key = `${concern}:${strategy}`
      return this.registeredStrategies.has(key)
    },
    strategiesFor: (concern: string): string[] => {
      return Array.from(this.registeredStrategies.keys())
        .filter((key) => key.startsWith(`${concern}:`))
        .map((key) => {
          const strategy = key.split(":")[1]
          return strategy ?? ""
        })
        .filter((s) => s.length > 0)
    },
    clear: (): void => {
      this.registeredStrategies.clear()
    },
  })

  get providers() {
    return this.getProvidersRegistry()
  }

  clearProviders(): void {
    this.providers.clear()
  }

  async boot(config: BootConfig): Promise<void> {
    this.validator.validate(config, this)
    // Boot logic continues...
  }
}

export const justjs = JustJS.getInstance()
