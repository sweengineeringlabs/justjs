import type { ComponentContext, RuntimeAdapter } from "../../api/component.js"
import { NoopRuntimeAdapter } from "../../api/component.js"
import type { Lifecycle, LifecycleStep } from "../../api/lifecycle.js"
import { LifecycleError } from "../../api/lifecycle.js"
import type { DefaultComponentRegistry } from "../registry/component_registry.js"
import type { DomAddressMap } from "../../api/dom-address.js"

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
    private readonly domAddressMap?: DomAddressMap,
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
      // Resolve by `tag` (justweb#56) — the actually-registered custom-element
      // tag — not `component` (the bare *_component.yaml name), which never
      // matches a real customElements/COMPONENT_REGISTRY entry.
      const ddasIds = Object.entries(this.domAddressMap.elements)
        .filter(([, element]) => element.tag === ctx.tag)
        .map(([address]) => address)
      if (ddasIds.length === 0) {
        throw new LifecycleError("mount", `No DDAS entry found for component tag "${ctx.tag}"`)
      }
      this.runtimeAdapter.mount(ddasIds[0]!, ctx.element)
    }
  }
}

export class RenderStep implements LifecycleStep {
  constructor(private readonly registry?: DefaultComponentRegistry) {}

  name(): string {
    return "render"
  }

  async execute(ctx: ComponentContext): Promise<void> {
    if (!ctx.element) {
      throw new LifecycleError("render", "Cannot render without element")
    }

    if (this.registry) {
      const component = await this.registry.get(ctx.tag, ctx.props)
      await component.render(ctx.props, ctx.element)
    }
  }
}

export class UpdateStep implements LifecycleStep {
  constructor(private readonly registry?: DefaultComponentRegistry) {}

  name(): string {
    return "update"
  }

  // A component's `update` hook is optional (api/component.ts) — components that
  // only implement `render` have nothing distinct for this step to do, since
  // RenderStep already painted this pass with the current props. This step exists
  // for components that need a separate reaction to being run again (e.g. patching
  // instead of a full re-render) without forcing every component to define one.
  async execute(ctx: ComponentContext): Promise<void> {
    if (!this.registry) {
      return
    }

    const component = await this.registry.get(ctx.tag, ctx.props)
    if (component.update) {
      await component.update(ctx.props, ctx.element)
    }
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

  constructor(
    domAddressMap?: DomAddressMap,
    runtimeAdapter?: RuntimeAdapter,
    registry?: DefaultComponentRegistry
  ) {
    this.steps = [
      new ResolveStep(),
      new MountStep(domAddressMap, runtimeAdapter),
      new RenderStep(registry),
      new UpdateStep(registry),
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
