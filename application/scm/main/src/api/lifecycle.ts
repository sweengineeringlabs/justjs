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

  // Re-runs only render()/update() against an already-mounted ctx - skips
  // resolve/mount/unmount, which have nothing new to do for a ctx that a
  // prior run() already resolved and mounted (justjs#65). Used for the
  // ADR-0004 store-subscribed re-render, so a RuntimeAdapter's mount() side
  // effects fire once at real navigation time, not again on every
  // unrelated store change.
  rerender(ctx: ComponentContext): Promise<void>

  // Calls the MountHandle a prior run(ctx) obtained for this exact ctx
  // (justjs#67) - the real teardown trigger a RuntimeAdapter needs, distinct
  // from UnmountStep's per-run() no-op (which fires immediately after every
  // mount, not when a component is actually being torn down). A no-op if
  // this ctx was never mounted, or has already been unmounted.
  unmount(ctx: ComponentContext): Promise<void>
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
