import type { Signal, FeatureStore } from "@justjs/data"
import type { ApiAdapter }           from "@justjs/transport"
import type { UISecurityContext }    from "./security.js"
import type { UIObserverContext }    from "./observer.js"
import type { RuntimeAdapter }       from "./runtime.js"
import type { Router }               from "./router.js"
import type { I18nContext }          from "./i18n.js"
import type { FlagsContext }         from "./flags.js"

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
  router:     Router
  i18n:       I18nContext
  flags:      FlagsContext
}

export interface MountHandle {
  readonly componentId: string
  readonly tagName:     string
  readonly ddas:        string
}
