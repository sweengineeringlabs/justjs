import type { Lifecycle, LifecycleStep, LifecycleEvent } from "../api/lifecycle.js"
import type { ComponentContext }                          from "../api/component.js"

export class DefaultLifecycle implements Lifecycle {
  readonly #steps:    LifecycleStep[]
  readonly #handlers = new Set<(e: LifecycleEvent) => void>()

  constructor(steps: LifecycleStep[]) {
    this.#steps = steps
  }

  steps(): LifecycleStep[] {
    return [...this.#steps]
  }

  async run(ctx: ComponentContext): Promise<void> {
    for (const step of this.#steps) {
      this.#emit({ type: `${step.name()}_started` as LifecycleEvent["type"], componentId: ctx.component.id(), occurredAt: Date.now() })
      try {
        await step.execute(ctx)
        this.#emit({ type: `${step.name()}_completed` as LifecycleEvent["type"], componentId: ctx.component.id(), occurredAt: Date.now() })
      } catch (err) {
        this.#emit({ type: `${step.name()}_failed` as LifecycleEvent["type"], componentId: ctx.component.id(), occurredAt: Date.now() })
        throw err
      }
    }
  }

  #emit(event: LifecycleEvent): void {
    for (const fn of this.#handlers) fn(event)
  }
}

export class MountStep implements LifecycleStep {
  name(): string { return "mount" }

  async execute(ctx: ComponentContext): Promise<void> {
    const ddas = ctx.component.id()
    const handle = await ctx.platform.mount(ctx.component, ddas)
    void handle
  }
}

export class ResolveStep implements LifecycleStep {
  name(): string { return "resolve" }

  async execute(ctx: ComponentContext): Promise<void> {
    void ctx
  }
}
