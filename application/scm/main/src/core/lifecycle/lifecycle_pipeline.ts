import type { ComponentContext, RuntimeAdapter } from "../../api/component.js"
import { NoopRuntimeAdapter } from "../../api/component.js"
import type { Lifecycle, LifecycleStep } from "../../api/lifecycle.js"
import { LifecycleError } from "../../api/lifecycle.js"

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
  constructor(
    private readonly domAddressMap?: Record<string, readonly string[]>,
    private readonly runtimeAdapter: RuntimeAdapter = new NoopRuntimeAdapter()
  ) {}

  name(): string {
    return "mount"
  }

  async execute(ctx: ComponentContext): Promise<void> {
    if (!ctx.element) {
      throw new LifecycleError("mount", "Missing DOM element")
    }

    if (this.domAddressMap) {
      const ddasIds = this.domAddressMap[ctx.tag]
      if (!ddasIds || ddasIds.length === 0) {
        throw new LifecycleError("mount", `No DDAS entry found for component tag "${ctx.tag}"`)
      }
      this.runtimeAdapter.mount(ddasIds[0]!, ctx.element)
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
  private steps: LifecycleStep[]

  constructor(domAddressMap?: Record<string, readonly string[]>, runtimeAdapter?: RuntimeAdapter) {
    this.steps = [
      new ResolveStep(),
      new MountStep(domAddressMap, runtimeAdapter),
      new RenderStep(),
      new UpdateStep(),
      new UnmountStep(),
    ]
  }

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
