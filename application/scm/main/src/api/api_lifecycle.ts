import type { ComponentContext } from "./component.js"

export type LifecycleEventType =
  | "resolve_start"
  | "resolve_end"
  | "mount_start"
  | "mount_end"
  | "render_start"
  | "render_end"
  | "update_start"
  | "update_end"
  | "unmount_start"
  | "unmount_end"
  | "resolve_failed"
  | "mount_failed"
  | "render_failed"
  | "update_failed"
  | "unmount_failed"

export interface LifecycleStep {
  name(): string
  execute(ctx: ComponentContext): Promise<void>
}

export interface Lifecycle {
  run(ctx: ComponentContext): Promise<void>
}

export class LifecycleError extends Error {
  constructor(
    readonly step: string,
    message?: string
  ) {
    super(message ?? `Lifecycle step failed: ${step}`)
    this.name = "LifecycleError"
  }
}
