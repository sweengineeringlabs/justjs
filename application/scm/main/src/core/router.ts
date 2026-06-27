import type { Signal }           from "@justjs/data"
import { createSignal }           from "@justjs/data"
import type { Route, RouteMatch, Router, InteractionProxy, InteractionEvent } from "../api/router.js"
import type { RouteGuard }        from "../api/security.js"
import type { RoutesManifest }    from "../api/boot.js"

function matchRoute(routes: Route[], url: URL): RouteMatch | null {
  for (const route of routes) {
    const params = extractParams(route.path, url.pathname)
    if (params !== null) return { route, params }
  }
  return null
}

function extractParams(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split("/")
  const pathParts    = pathname.split("/")
  if (patternParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i]!
    const v = pathParts[i]!
    if (p.startsWith(":")) { params[p.slice(1)] = v }
    else if (p !== v) return null
  }
  return params
}

export class DefaultRouter implements Router {
  readonly #routes: Route[]
  readonly #current: ReturnType<typeof createSignal<RouteMatch | null>>
  readonly guards: RouteGuard[]

  constructor(manifest: RoutesManifest, guards: RouteGuard[] = []) {
    this.#routes  = manifest.routes.map(r => ({ path: r.path, componentId: r.componentId, featureId: r.featureId }))
    this.#current = createSignal<RouteMatch | null>(null)
    this.guards   = guards
  }

  get current(): Signal<RouteMatch | null> {
    return this.#current
  }

  resolve(url: URL): RouteMatch | null {
    return matchRoute(this.#routes, url)
  }

  async navigate(url: URL): Promise<void> {
    const match = matchRoute(this.#routes, url)
    for (const guard of this.guards) {
      if (match !== null) {
        const allowed = await guard.canActivate(match.route, { principal: () => null, isAuthenticated: () => false, hasRole: () => false, hasPermission: () => false, token: () => null })
        if (!allowed) {
          globalThis.history?.pushState({}, "", guard.redirectTo())
          return
        }
      }
    }
    this.#current.set(match)
    globalThis.history?.pushState({}, "", url)
  }
}

export class DefaultInteractionProxy implements InteractionProxy {
  readonly #navigateListeners  = new Set<(url: URL) => void>()
  readonly #interactionListeners = new Set<(e: InteractionEvent) => void>()
  readonly #messageListeners   = new Set<(msg: unknown) => void>()

  onNavigate(fn: (url: URL) => void): () => void {
    this.#navigateListeners.add(fn)
    return () => { this.#navigateListeners.delete(fn) }
  }

  onInteraction(fn: (e: InteractionEvent) => void): () => void {
    this.#interactionListeners.add(fn)
    return () => { this.#interactionListeners.delete(fn) }
  }

  onMessage(fn: (msg: unknown) => void): () => void {
    this.#messageListeners.add(fn)
    return () => { this.#messageListeners.delete(fn) }
  }

  navigate(url: URL): void {
    for (const fn of this.#navigateListeners) fn(url)
  }
}
