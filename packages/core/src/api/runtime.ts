import type { Component, MountHandle } from "./component.js"
import type { Signal }                  from "./store.js"

export interface RuntimeAdapter {
  mount(component: Component<unknown, unknown, unknown>, target: unknown): Promise<MountHandle>
  unmount(handle: MountHandle): Promise<void>
  render(component: Component<unknown, unknown, unknown>, signals: Record<string, Signal<unknown>>): unknown
}
