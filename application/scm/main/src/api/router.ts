import type { Signal }    from "@justjs/data"
import type { RouteGuard } from "./security.js"

export interface Route {
  readonly path:        string
  readonly componentId: string
  readonly featureId:   string
}

export interface RouteMatch {
  readonly route:  Route
  readonly params: Record<string, string>
}

export interface Router {
  resolve(url: URL): RouteMatch | null
  navigate(url: URL): Promise<void>
  readonly current: Signal<RouteMatch | null>
  readonly guards:  RouteGuard[]
}

export interface ComponentRegistry {
  register(id: string, tagName: string): void
  get(id: string): { id: string; tagName: string } | null
  all(): Array<{ id: string; tagName: string }>
}

export interface InteractionProxy {
  onNavigate(fn: (url: URL) => void):               () => void
  onInteraction(fn: (e: InteractionEvent) => void): () => void
  onMessage(fn: (msg: unknown) => void):             () => void
  navigate(url: URL): void
}

export interface InteractionEvent {
  readonly type:        string
  readonly componentId: string
  readonly payload?:    unknown
}
