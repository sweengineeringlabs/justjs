import type { AspectConfig, AspectProviderSpec, BootConfig, JustJSInstance, JustJSProviderRegistry } from "../api/boot.js"
import { BootError } from "../api/boot.js"
import type { DomAddressMap } from "../api/dom-address.js"
import { resolveDdasKnownTags } from "../api/dom-address.js"
import { SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA, SUPPORTED_JUSTWEB_GENERATOR_REVISION, SUPPORTED_JUSTWEB_GENERATOR_VERSION } from "../api/justweb_contract.js"
import type { JustJSAspect } from "../api/aspect.js"
import type { ComponentRegistry, LazyCustomElementRegistry, RouteRegistryEntry, Router } from "../api/registry.js"
import type { Lifecycle } from "../api/lifecycle.js"
import { adaptCustomElementRegistry } from "./registry/component_registry_adapter.js"
import { DefaultLifecycle } from "./lifecycle/lifecycle_pipeline.js"
import { DefaultRouter } from "./registry/router.js"
import type { ApiAdapter } from "@justjs/transport"
import { createApiAdapter } from "@justjs/transport"
import { createFetchAdapter } from "@justjs/network"

function isComponentRegistry(x: LazyCustomElementRegistry | ComponentRegistry): x is ComponentRegistry {
  return typeof (x as ComponentRegistry).get === "function"
}

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

  async validate(config: BootConfig, justjs: JustJS): Promise<void> {
    // Check for missing required config
    if (!config.routes) {
      throw new BootError("MISSING_ROUTES")
    }
    if (!config.registry) {
      throw new BootError("MISSING_REGISTRY")
    }

    const routes = config.routes as readonly unknown[]
    const registry = config.registry as Record<string, any>
    const domAddressMap = config.domAddressMap as DomAddressMap | undefined
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

    // AC 4: DDAS entries are a mandatory framework invariant (#157).
    {
      if (!domAddressMap || !domAddressMap.elements) {
        throw new BootError(
          "INVALID_DDAS_MAP",
          undefined,
          undefined,
          undefined,
          'A JustWeb domAddressMap with an "elements" map is required.'
        )
      }

      const knownComponents = resolveDdasKnownTags(domAddressMap)
      for (const [tag] of registryEntries) {
        if (!knownComponents.has(tag)) {
          const known = Array.from(knownComponents)
          const message = `Component tag "${tag}" missing DDAS entry in dom-address-map`
          throw new BootError("MISSING_DDAS_ENTRY", tag, known, undefined, message)
        }
      }
    }

    // AC 1: Validate providers registered in JustJS.providers
    if (aspects) {
      for (const [concern, aspectConfig] of Object.entries(aspects)) {
        if (!aspectConfig || typeof aspectConfig !== "object" || typeof aspectConfig.strategy !== "string") {
          throw new BootError(
            "MISSING_ASPECT_STRATEGY",
            concern,
            [],
            undefined,
            `Aspect "${concern}" is missing a required "strategy" field`
          )
        }

        const strategy = aspectConfig.strategy
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

    // AC 2 & 3: Validate aspect routes and components
    if (aspects) {
      const registryTags = Object.keys(registry)
      for (const [aspectName, aspectConfig] of Object.entries(aspects)) {
        if (!aspectConfig || typeof aspectConfig !== "object") {
          throw new BootError(
            "INVALID_ASPECT_CONFIG",
            String(aspectConfig),
            undefined,
            undefined,
            `Aspect "${aspectName}" config must be an object, got ${typeof aspectConfig}`
          )
        }
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
    await this.validateJustWebManifest(config)
  }

  private async validateJustWebManifest(config: BootConfig): Promise<void> {
    const manifest = config.justwebManifest
    const fail = (message: string): never => {
      throw new BootError("INVALID_JUSTWEB_MANIFEST", undefined, undefined, undefined, message)
    }
    if (!manifest || manifest.format !== "justweb-artifact-manifest" || manifest.formatVersion !== 1) {
      fail("A JustWeb artifact manifest (formatVersion 1) is required. Run `justw generate app` and pass its generated manifest to boot().")
    }
    const contract = config.justwebContract
    if (!contract || contract.generatorVersion !== manifest.generator.version ||
        contract.generatorRevision !== manifest.generator.revision || contract.artifactSchema !== manifest.formatVersion) {
      fail("The mandatory JustWeb contract pin must exactly match the generated manifest's version, revision, and artifact schema.")
    }
    if (manifest.generator?.name !== "justw" || manifest.generator.version !== SUPPORTED_JUSTWEB_GENERATOR_VERSION ||
        manifest.generator.revision !== SUPPORTED_JUSTWEB_GENERATOR_REVISION || manifest.formatVersion !== SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA) {
      fail(`Unsupported JustWeb generator. JustJS requires justw ${SUPPORTED_JUSTWEB_GENERATOR_VERSION} at ${SUPPORTED_JUSTWEB_GENERATOR_REVISION} with artifact schema ${SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA}.`)
    }
    if (!/^[a-f0-9]{40}$/.test(manifest.generator.revision)) {
      fail("JustWeb manifest must record the exact 40-character generator source revision.")
    }
    if (manifest.generator.sourceDirty !== false) {
      fail("JustWeb manifest was emitted from a modified generator checkout; regenerate with a clean, pinned justw source revision.")
    }
    if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
      fail("JustWeb manifest has no generated artifacts. Regenerate the app with `justw generate app`.")
    }
    const paths = new Set<string>()
    for (const artifact of manifest.artifacts) {
      if (!artifact || typeof artifact.path !== "string" || artifact.path.includes("\\") ||
          artifact.path.startsWith("/") || /^[a-zA-Z]:/.test(artifact.path) ||
          artifact.path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
        fail("JustWeb manifest contains an invalid artifact path.")
      }
      if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) {
        fail(`JustWeb manifest artifact "${artifact.path}" has an invalid SHA-256 digest.`)
      }
      if (paths.has(artifact.path)) fail(`JustWeb manifest lists artifact "${artifact.path}" more than once.`)
      paths.add(artifact.path)
    }
    const hasFile = (name: string): boolean => [...paths].some((path) => path.endsWith(name))
    if (!hasFile("dom-address-map.json") || !hasFile("registry.gen.ts") || !hasFile("component-registry.gen.ts")) {
      fail("JustWeb manifest must cover dom-address-map.json, registry.gen.ts, and component-registry.gen.ts.")
    }
    if ((config.routes?.length ?? 0) > 0 && (!hasFile("routes.gen.json") || !hasFile("routes.gen.ts"))) {
      fail("Routed applications require routes.gen.json and routes.gen.ts in the JustWeb manifest.")
    }
    const addressMap = config.domAddressMap
    if (!addressMap) fail("JustWeb dom-address-map.json is mandatory. Pass its generated contents as domAddressMap.")
    const addressMapArtifact = manifest.artifacts.find((artifact) => artifact.path.endsWith("dom-address-map.json"))
    if (!addressMapArtifact) return fail("JustWeb manifest has no dom-address-map.json digest.")
    const bytes = new TextEncoder().encode(JSON.stringify(addressMap, null, 2))
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes)
    const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
    if (actual !== addressMapArtifact.sha256) {
      fail("The supplied domAddressMap does not match the JustWeb artifact digest. Regenerate and load the map and manifest from the same `justw generate app` run.")
    }

  }
}

export class JustJS implements JustJSInstance {
  private static instance: JustJS | null = null
  private validator = new BootValidator()
  private registeredStrategies = new Map<string, AspectProviderSpec>()
  private _apiAdapter?: ApiAdapter
  private _componentRegistry: ComponentRegistry | undefined
  private _lifecycle?: Lifecycle
  private _router?: Router

  static getInstance(): JustJS {
    if (!JustJS.instance) {
      JustJS.instance = new JustJS()
    }
    return JustJS.instance
  }

  private getProvidersRegistry = (): JustJSProviderRegistry => ({
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

  get providers(): JustJSProviderRegistry {
    return this.getProvidersRegistry()
  }

  clearProviders(): void {
    this.providers.clear()
  }

  // Populated by boot() once a componentRegistry is supplied in BootConfig —
  // undefined before boot() runs, or if the app registers no components at
  // all (nothing to render, so no working Lifecycle/Router either).
  get apiAdapter(): ApiAdapter | undefined {
    return this._apiAdapter
  }

  get componentRegistry(): ComponentRegistry | undefined {
    return this._componentRegistry
  }

  get lifecycle(): Lifecycle | undefined {
    return this._lifecycle
  }

  get router(): Router | undefined {
    return this._router
  }

  async boot(config: BootConfig): Promise<void> {
    await this.validator.validate(config, this)

    const aspects = config.aspects as Record<string, AspectConfig> | undefined
    if (aspects) {
      for (const [concern, aspectConfig] of Object.entries(aspects)) {
        const spec = this.providers.resolve(concern, aspectConfig.strategy)
        if (!spec) continue // unreachable — validate() already rejected any unregistered strategy
        const aspect = spec.factory(aspectConfig.config) as JustJSAspect
        aspect.weave({
          concern,
          routes: [...(aspectConfig.routes?.on ?? []), ...(aspectConfig.routes?.except ?? [])],
          components: [...(aspectConfig.components?.on ?? []), ...(aspectConfig.components?.except ?? [])],
        })
      }
    }

    this.buildRuntime(config)
  }

  private buildRuntime(config: BootConfig): void {
    const registry = config.componentRegistry
      ? isComponentRegistry(config.componentRegistry)
        ? config.componentRegistry
        : adaptCustomElementRegistry(config.componentRegistry)
      : undefined

    this._apiAdapter = config.apiAdapter ?? createApiAdapter(createFetchAdapter())
    this._componentRegistry = registry
    const addressMap = config.domAddressMap!
    const immutableAddressMap: DomAddressMap = Object.freeze({
      ...addressMap,
      elements: Object.freeze(Object.fromEntries(
        Object.entries(addressMap.elements).map(([id, element]) => [id, Object.freeze({ ...element })])
      )),
    })
    this._lifecycle = new DefaultLifecycle(immutableAddressMap, config.runtimeAdapter, registry, config.errorBoundary)
    this._router = new DefaultRouter(
      config.routes ?? [],
      (config.registry ?? {}) as Record<string, RouteRegistryEntry>,
      this._lifecycle,
      immutableAddressMap,
      config.featureStore,
      config.eventBus
    )
  }
}

export const justjs: JustJSInstance = JustJS.getInstance()
