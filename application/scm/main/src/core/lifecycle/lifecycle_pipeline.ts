import type { ComponentContext } from "../../api/api_component.js"
import type { Lifecycle, LifecycleStep } from "../../api/api_lifecycle.js"
import { LifecycleError } from "../../api/api_lifecycle.js"

export class ResolveStep implements LifecycleStep {
  name(): string {
    return "resolve"
  }

  async execute(ctx: ComponentContext): Promise<void> {
    if (!ctx.tag) {
      throw new LifecycleError("resolve", "Missing component tag")
    }
  }
}

export class MountStep implements LifecycleStep {
  name(): string {
    return "mount"
  }

  async execute(ctx: ComponentContext): Promise<void> {
    if (!ctx.element) {
      throw new LifecycleError("mount", "Missing DOM element")
    }
  }
}

export class RenderStep implements LifecycleStep {
  name(): string {
    return "render"
  }

  async execute(ctx: ComponentContext): Promise<void> {
    if (!ctx.element) {
      throw new LifecycleError("render", "Cannot render without element")
    }
  }
}

export class UpdateStep implements LifecycleStep {
  name(): string {
    return "update"
  }

  async execute(ctx: ComponentContext): Promise<void> {
    // No-op for now
  }
}

export class UnmountStep implements LifecycleStep {
  name(): string {
    return "unmount"
  }

  async execute(ctx: ComponentContext): Promise<void> {
    // Cleanup
  }
}

export class DefaultLifecycle implements Lifecycle {
  private steps: LifecycleStep[] = [
    new ResolveStep(),
    new MountStep(),
    new RenderStep(),
    new UpdateStep(),
    new UnmountStep(),
  ]

  async run(ctx: ComponentContext): Promise<void> {
    for (const step of this.steps) {
      try {
        await step.execute(ctx)
      } catch (error) {
        throw new LifecycleError(step.name(), String(error))
      }
    }
  }
}
