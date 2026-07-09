import type { ComponentContext, ComponentDataContext, RuntimeAdapter } from "../../api/component.js"
import { NoopRuntimeAdapter } from "../../api/component.js"
import type { Lifecycle, LifecycleStep } from "../../api/lifecycle.js"
import { LifecycleError } from "../../api/lifecycle.js"
import type { ComponentRegistry } from "../../api/registry.js"
import type { DomAddressMap } from "../../api/dom-address.js"
import { isLegacyDomAddressMap, resolveDdasAddressesForTag } from "../../api/dom-address.js"
import type { ErrorBoundary } from "../../api/error_boundary.js"

// ADR-0003 D7: only carries a key when the corresponding ComponentContext
// field is actually present — exactOptionalPropertyTypes forbids assigning
// `undefined` to an optional property outright, and a component reading
// `ctx?.store` shouldn't see a key that's there but empty either way.
function toDataContext(ctx: ComponentContext): ComponentDataContext | undefined {
  if (ctx.store === undefined && ctx.eventBus === undefined) {
    return undefined
  }
  return {
    ...(ctx.store !== undefined ? { store: ctx.store } : {}),
    ...(ctx.eventBus !== undefined ? { eventBus: ctx.eventBus } : {}),
  }
}

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
      if (!this.domAddressMap.elements) {
        throw new LifecycleError(
          "mount",
          'domAddressMap is missing its "elements" map — expected the real dom-address-map.json shape ({ elements: {...} }), not the legacy CSS-selector-list shape'
        )
      }

      if (isLegacyDomAddressMap(this.domAddressMap)) {
        throw new LifecycleError(
          "mount",
          "domAddressMap has no `tag` field on any element — this looks like a dom-address-map.json generated before justweb#56. Regenerate it with a current justweb version; mounting cannot resolve component tags without `tag`."
        )
      }

      // Resolve by `tag` (justweb#56) — the actually-registered custom-element
      // tag — not `component` (the bare *_component.yaml name), which never
      // matches a real customElements/COMPONENT_REGISTRY entry.
      const ddasIds = resolveDdasAddressesForTag(this.domAddressMap, ctx.tag)
      if (ddasIds.length === 0) {
        throw new LifecycleError("mount", `No DDAS entry found for component tag "${ctx.tag}"`)
      }
      this.runtimeAdapter.mount(ddasIds[0]!, ctx.element)
    }
  }
}

export class RenderStep implements LifecycleStep {
  constructor(
    private readonly registry?: ComponentRegistry,
    private readonly errorBoundary?: ErrorBoundary
  ) {}

  name(): string {
    return "render"
  }

  async execute(ctx: ComponentContext): Promise<void> {
    if (!ctx.element) {
      throw new LifecycleError("render", "Cannot render without element")
    }

    if (this.registry) {
      const component = await this.registry.get(ctx.tag, ctx.props)
      try {
        await component.render(ctx.props, ctx.element, toDataContext(ctx))
      } catch (error) {
        if (!this.errorBoundary) {
          throw error
        }
        this.errorBoundary.onError(error, ctx)
      }
    }
  }
}

export class UpdateStep implements LifecycleStep {
  constructor(
    private readonly registry?: ComponentRegistry,
    private readonly errorBoundary?: ErrorBoundary
  ) {}

  name(): string {
    return "update"
  }

  // A component's `update` hook is optional (api/component.ts) — components that
  // only implement `render` have nothing distinct for this step to do, since
  // RenderStep already painted this pass with the current props. This step exists
  // for components that want a separate reaction alongside render() (e.g.
  // patching instead of a full re-render) without forcing every component to
  // define one. Note: `update` fires on every `run()` call, including the
  // very first mount, same as `render` — there is no first-mount-vs-repeat
  // distinction here, since ComponentContext carries no prior-call state to
  // detect one from (a deliberate scope limit, not an oversight).
  async execute(ctx: ComponentContext): Promise<void> {
    if (!this.registry) {
      return
    }

    const component = await this.registry.get(ctx.tag, ctx.props)
    if (component.update) {
      try {
        await component.update(ctx.props, ctx.element, toDataContext(ctx))
      } catch (error) {
        if (!this.errorBoundary) {
          throw error
        }
        this.errorBoundary.onError(error, ctx)
      }
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
    registry?: ComponentRegistry,
    errorBoundary?: ErrorBoundary
  ) {
    this.steps = [
      new ResolveStep(),
      new MountStep(domAddressMap, runtimeAdapter),
      new RenderStep(registry, errorBoundary),
      new UpdateStep(registry, errorBoundary),
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
