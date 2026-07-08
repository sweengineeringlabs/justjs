import type { FeatureStore, UIEventBus } from "@justjs/data"

export interface ComponentProps {
  readonly [key: string]: unknown
}

// Shared data-layer access, passed through to a mounted component's
// render()/update() when boot()/DefaultRouter were given a FeatureStore or
// UIEventBus to share (ADR-0003 D6). Both optional and additive — a
// Component that never reads this third argument is still a valid
// Component; nothing about its render()/update() signature needs to change
// to keep compiling.
export interface ComponentDataContext {
  readonly store?: FeatureStore
  readonly eventBus?: UIEventBus
}

export interface Component<Props extends ComponentProps = ComponentProps> {
  name: string
  render(props: Props, element: Element, ctx?: ComponentDataContext): void | Promise<void>
  update?(props: Props, element: Element, ctx?: ComponentDataContext): void | Promise<void>
}

export interface ComponentContext {
  readonly tag: string
  readonly props: ComponentProps
  readonly element: Element
}

export interface MountHandle {
  unmount(): void
}

export interface RuntimeAdapter {
  mount(ddasId: string, element: Element): MountHandle
}

export class NoopRuntimeAdapter implements RuntimeAdapter {
  mount(): MountHandle {
    return { unmount() {} }
  }
}

export class ComponentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ComponentError"
  }
}
