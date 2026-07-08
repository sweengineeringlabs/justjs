import type { Router, RouteRegistryEntry } from "../../api/registry.js"
import { RegistryError } from "../../api/registry.js"
import type { Lifecycle } from "../../api/lifecycle.js"
import type { DomAddressMap } from "../../api/dom-address.js"
import { resolveDdasAddressesForTag } from "../../api/dom-address.js"
import type { ComponentContext, ComponentProps } from "../../api/component.js"
import type { FeatureStore, UIEventBus } from "@justjs/data"

// Matches a route pattern (e.g. "/order/:id") against a real navigated path
// (e.g. "/order/42"), returning the captured `:segment` values keyed by
// segment name, or undefined if the pattern doesn't match. A pattern with no
// ":segments" matches only an identical path and captures nothing.
function matchRoutePattern(pattern: string, path: string): Record<string, string> | undefined {
  const patternSegments = pattern.split("/")
  const pathSegments = path.split("/")
  if (patternSegments.length !== pathSegments.length) {
    return undefined
  }

  const captured: Record<string, string> = {}
  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i]!
    const pathSegment = pathSegments[i]!
    if (patternSegment.startsWith(":")) {
      captured[patternSegment.slice(1)] = pathSegment
    } else if (patternSegment !== pathSegment) {
      return undefined
    }
  }
  return captured
}

export class DefaultRouter implements Router {
  private currentRoute = "/"

  constructor(
    private readonly routes: readonly string[],
    private readonly registry: Record<string, RouteRegistryEntry>,
    private readonly lifecycle: Lifecycle,
    private readonly domAddressMap?: DomAddressMap,
    private readonly featureStore?: FeatureStore,
    private readonly eventBus?: UIEventBus
  ) {}

  async navigate(path: string): Promise<void> {
    if (!path.startsWith("/")) {
      throw new RegistryError(`Route must start with /: ${path}`)
    }

    const matchedPattern = this.routes.find((pattern) => matchRoutePattern(pattern, path) !== undefined)
    if (!matchedPattern) {
      throw new RegistryError(`Unknown route: ${path}`)
    }

    const entry = Object.entries(this.registry).find(([, e]) => e.path === matchedPattern)
    if (!entry) {
      throw new RegistryError(`No registered component for route: ${path}`)
    }
    const [tag, routeEntry] = entry

    const captured = matchRoutePattern(matchedPattern, path) ?? {}
    const props: Record<string, string> = {}
    if (routeEntry.params) {
      for (const [segmentName, propName] of Object.entries(routeEntry.params)) {
        if (captured[segmentName] !== undefined) {
          props[propName] = captured[segmentName]!
        }
      }
    }

    const ddasIds = this.domAddressMap ? resolveDdasAddressesForTag(this.domAddressMap, tag) : []
    const element =
      ddasIds.length > 0
        ? document.querySelector(`[data-ddas-id="${ddasIds[0]}"]`)
        : document.querySelector(tag) // fallback: bare custom-element lookup, no DDAS map supplied

    if (!element) {
      throw new RegistryError(`No DOM element found for route "${path}" (tag "${tag}")`)
    }

    this.currentRoute = path
    await this.lifecycle.run(this.buildContext(tag, element, props))
  }

  private buildContext(tag: string, element: Element, props: ComponentProps): ComponentContext {
    return {
      tag,
      props,
      element,
      ...(this.featureStore !== undefined ? { store: this.featureStore } : {}),
      ...(this.eventBus !== undefined ? { eventBus: this.eventBus } : {}),
    }
  }

  currentPath(): string {
    return this.currentRoute
  }
}
