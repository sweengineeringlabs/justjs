import type { Router } from "../../api/registry.js"
import { RegistryError } from "../../api/registry.js"
import type { Lifecycle } from "../../api/lifecycle.js"
import type { DomAddressMap } from "../../api/dom-address.js"
import { resolveDdasAddressesForTag } from "../../api/dom-address.js"

export interface RouteRegistryEntry {
  readonly path: string
  readonly component: string
}

export class DefaultRouter implements Router {
  private currentRoute = "/"

  constructor(
    private readonly routes: readonly string[],
    private readonly registry: Record<string, RouteRegistryEntry>,
    private readonly lifecycle: Lifecycle,
    private readonly domAddressMap?: DomAddressMap
  ) {}

  async navigate(path: string): Promise<void> {
    if (!path.startsWith("/")) {
      throw new RegistryError(`Route must start with /: ${path}`)
    }
    if (!this.routes.includes(path)) {
      throw new RegistryError(`Unknown route: ${path}`)
    }

    const entry = Object.entries(this.registry).find(([, e]) => e.path === path)
    if (!entry) {
      throw new RegistryError(`No registered component for route: ${path}`)
    }
    const [tag] = entry

    const ddasIds = this.domAddressMap ? resolveDdasAddressesForTag(this.domAddressMap, tag) : []
    const element =
      ddasIds.length > 0
        ? document.querySelector(`[data-ddas-id="${ddasIds[0]}"]`)
        : document.querySelector(tag) // fallback: bare custom-element lookup, no DDAS map supplied

    if (!element) {
      throw new RegistryError(`No DOM element found for route "${path}" (tag "${tag}")`)
    }

    this.currentRoute = path
    await this.lifecycle.run({ tag, props: {}, element })
  }

  currentPath(): string {
    return this.currentRoute
  }
}
