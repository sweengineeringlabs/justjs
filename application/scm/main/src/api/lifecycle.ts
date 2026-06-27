import type { ComponentContext } from "./component.js"

export interface LifecycleStep {
  name(): string
  execute(ctx: ComponentContext): Promise<void>
}

export interface Lifecycle {
  run(ctx: ComponentContext): Promise<void>
  steps(): LifecycleStep[]
}

export type LifecycleEventType =
  | "resolve_started"  | "resolve_completed"  | "resolve_failed"
  | "mount_started"    | "mount_completed"    | "mount_failed"
  | "render_started"   | "render_completed"
  | "updated"
  | "unmount_started"  | "unmount_completed"

export interface LifecycleEvent {
  type:        LifecycleEventType
  componentId: string
  occurredAt:  number
}
