import type { BootConfig, JustJSBoot } from "../api/boot.js"
import { BootError } from "../api/boot.js"

class BootValidator {
  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = []
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
          matrix[i - 1][j - 1] + cost
        )
      }
    }
    return matrix[b.length][a.length]
  }

  private findNearest(target: string, candidates: string[]): string | undefined {
    if (candidates.length === 0) return undefined
    let nearest = candidates[0]
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

  validate(config: BootConfig): void {
    // Check for missing required config
    if (!config.routes) {
      throw new BootError("MISSING_ROUTES")
    }
    if (!config.registry) {
      throw new BootError("MISSING_REGISTRY")
    }

    const routes = config.routes as unknown[]
    const registry = config.registry as Record<string, any>

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
  }
}

export class JustJS implements JustJSBoot {
  private static instance: JustJS | null = null
  private validator = new BootValidator()

  static getInstance(): JustJS {
    if (!JustJS.instance) {
      JustJS.instance = new JustJS()
    }
    return JustJS.instance
  }

  async boot(config: BootConfig): Promise<void> {
    this.validator.validate(config)
    // Boot logic continues...
  }
}

export const justjs = JustJS.getInstance()
