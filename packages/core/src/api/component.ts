export interface Component<Props, State, Events> {
  id(): string
  tagName(): string
  defaultProps(): Props
  initialState(props: Props): State
  events(): (keyof Events)[]
}

export interface ComponentContext {
  component:  Component<unknown, unknown, unknown>
  props:      Record<string, unknown>
  signals:    Record<string, Signal<unknown>>
  security:   UISecurityContext
  store:      FeatureStore<unknown, unknown>
  api:        ApiAdapter
  observer:   UIObserverContext
  platform:   RuntimeAdapter
}

export interface MountHandle {
  readonly componentId: string
  readonly tagName: string
}

// Forward references — implementations live in core/
import type { Signal }            from "./store.js"
import type { UISecurityContext } from "./security.js"
import type { FeatureStore }      from "./store.js"
import type { ApiAdapter }        from "./transport.js"
import type { UIObserverContext } from "./observer.js"
import type { RuntimeAdapter }    from "./runtime.js"
