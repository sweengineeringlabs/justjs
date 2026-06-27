import type { Signal }            from "@justjs/data"
import type { Component, MountHandle } from "./component.js"

export interface RuntimeAdapter {
  mount(component: Component<unknown, unknown, unknown>, target: string): Promise<MountHandle>
  unmount(handle: MountHandle): Promise<void>
  render(component: Component<unknown, unknown, unknown>, signals: Record<string, Signal<unknown>>): unknown
}
