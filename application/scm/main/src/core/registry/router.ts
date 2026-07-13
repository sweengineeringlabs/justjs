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
  // ADR-0004: the previous route's subscription must stop reacting once
  // navigation moves on - otherwise a store change would keep re-rendering
  // a view that's no longer current.
  private unsubscribeStore: (() => void) | undefined
  // justjs#67: the previously-mounted route's ctx, so it can be unmounted
  // (its RuntimeAdapter's MountHandle cleaned up) when navigating to a
  // genuinely different route - undefined before the first successful
  // navigate() call.
  private currentCtx: ComponentContext | undefined
  // justjs#94: every route currently kept alive (mounted, never torn down
  // on navigate-away), keyed by path - separate from currentCtx, which
  // tracks whichever route is CURRENT (subscribed to store changes)
  // regardless of whether it also happens to be keep-alive.
  private readonly keptAliveCtxs = new Map<string, ComponentContext>()

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

    this.unsubscribeStore?.()
    this.unsubscribeStore = undefined

    const existingCtx = this.keptAliveCtxs.get(path)
    if (existingCtx && path !== this.currentRoute) {
      // justjs#94: returning to a route that's still alive elsewhere -
      // leave whatever's current (same unmount rule as below), then just
      // rerender() the existing ctx. Never run() - MountStep/
      // RuntimeAdapter.mount() must not re-fire for an already-mounted
      // keep-alive route. The rerender is deliberate, not a no-op: it
      // reflects any store changes that happened while this route was
      // backgrounded and unsubscribed, matching ADR-0004's "re-render
      // whenever the shared store changes, for as long as it stays
      // current" intent extended to "on becoming current again."
      await this.leaveCurrentRoute(path)
      this.currentRoute = path
      this.currentCtx = existingCtx
      await this.lifecycle.rerender(existingCtx)
    } else if (existingCtx) {
      // Re-navigating to the same already-alive route - always rerender(),
      // never run(). Stricter than the non-keep-alive same-route case
      // below (which still re-runs the full pipeline, justjs#67) -
      // "never remount after first mount" is the entire point of opting
      // a route into keepAlive.
      await this.lifecycle.rerender(existingCtx)
    } else {
      // First visit to this route, or any non-keep-alive route - today's
      // exact prior behavior, unchanged. justjs#67: unmount the previous
      // route's ctx only when actually leaving it for a different route -
      // re-navigating to the same route re-renders in place (matching
      // adaptCustomElementRegistry's element-reuse behavior), not a
      // tear-down-and-remount.
      await this.leaveCurrentRoute(path)
      this.currentRoute = path
      const ctx = this.buildContext(tag, element, props)
      await this.lifecycle.run(ctx)
      this.currentCtx = ctx
      if (routeEntry.keepAlive) {
        this.keptAliveCtxs.set(path, ctx)
      }
    }

    // ADR-0004: re-render whichever ctx just became current whenever the
    // shared store changes, for as long as it stays current.
    // DefaultComponentRegistry memoizes the resolved Component per tag, so
    // this re-run hits the same instance and reads fresh state directly
    // off ctx.store - no stale closures. Uses rerender() (justjs#65), not
    // run() - ctx is already resolved and mounted, so re-running resolve/
    // mount would repeat a RuntimeAdapter's mount() side effect on every
    // store change instead of once at real navigation time.
    if (this.featureStore) {
      const currentCtx = this.currentCtx!
      const currentPath = this.currentRoute
      this.unsubscribeStore = this.featureStore.subscribe(() => {
        this.lifecycle.rerender(currentCtx).catch((error: unknown) => {
          console.error(`Error re-rendering "${currentPath}" after a store change:`, error)
        })
      })
    }
  }

  // justjs#94: unmounts whatever's currently mounted, but only when
  // actually leaving it for a genuinely different route AND it isn't
  // itself being kept alive - shared by both the keep-alive and
  // non-keep-alive paths in navigate() so this exact condition never
  // drifts between two copies.
  private async leaveCurrentRoute(nextPath: string): Promise<void> {
    if (nextPath !== this.currentRoute && this.currentCtx && !this.keptAliveCtxs.has(this.currentRoute)) {
      await this.lifecycle.unmount(this.currentCtx)
      this.currentCtx = undefined
    }
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
