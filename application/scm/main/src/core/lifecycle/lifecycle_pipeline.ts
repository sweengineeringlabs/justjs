import type { ComponentContext, ComponentDataContext, MountHandle, RuntimeAdapter } from "../../api/component.js"
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
  private readonly runtimeAdapter: RuntimeAdapter

  constructor(
    private readonly domAddressMap?: DomAddressMap,
    // Not a parameter-property default (`runtimeAdapter: RuntimeAdapter = new
    // NoopRuntimeAdapter()`) - justc 0.3.4's bundler drops a constructor
    // parameter that carries a default-value expression from the emitted
    // parameter list while leaving the body's reference to it intact,
    // producing a real `ReferenceError: runtimeAdapter is not defined` at
    // runtime (confirmed via a minimal repro isolated from this exact call
    // site, and live on real android-shell hardware - justjs#16). Resolving
    // the default inside the constructor body instead sidesteps it.
    runtimeAdapter?: RuntimeAdapter,
    // Populated with the MountHandle mount() returns, keyed by this exact
    // ctx object - retrieved later by DefaultLifecycle.unmount(ctx) (justjs#67).
    // Optional so a caller building a MountStep directly (as existing tests
    // do) doesn't have to supply one just to keep working.
    private readonly mountHandles?: WeakMap<ComponentContext, MountHandle>
  ) {
    this.runtimeAdapter = runtimeAdapter ?? new NoopRuntimeAdapter()
  }

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
      const handle = this.runtimeAdapter.mount(ddasIds[0]!, ctx.element)
      this.mountHandles?.set(ctx, handle)
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

// Intentionally still a no-op (justjs#67). This step runs as the fifth step
// of every single run(ctx) call - immediately after that same call's
// Mount/Render/Update, not when a component is later navigated away from -
// so it never corresponds to a real "this component is being torn down"
// event and must not call a RuntimeAdapter's MountHandle.unmount() (that
// would immediately unmount what run() just mounted, moments earlier).
// DefaultLifecycle.unmount(ctx) is the real teardown trigger; DefaultRouter
// calls it when navigating away from a route, not through this step.
export class UnmountStep implements LifecycleStep {
  name(): string {
    return "unmount"
  }

  async execute(ctx: ComponentContext): Promise<void> {
    // Deliberately empty - see class comment above.
  }
}

export class DefaultLifecycle implements Lifecycle {
  private steps: LifecycleStep[]
  // Render+Update only (justjs#65) - the same step instances run() uses, not
  // separate copies, since RenderStep/UpdateStep carry no run-to-run mutable
  // state of their own (registry/errorBoundary are constructor-fixed).
  private rerenderSteps: LifecycleStep[]
  // The real mount/unmount tracking (justjs#67) - MountStep populates this on
  // every successful mount; unmount() below reads and clears it. A WeakMap
  // keyed by the ComponentContext object itself: DefaultRouter builds one
  // ComponentContext per navigation and reuses that exact object across
  // run()/rerender()/unmount() calls (justjs#65), so no separate identifier
  // is needed, and an unmounted or garbage-collected ctx's entry disappears
  // on its own.
  private mountHandles = new WeakMap<ComponentContext, MountHandle>()

  constructor(
    domAddressMap?: DomAddressMap,
    runtimeAdapter?: RuntimeAdapter,
    registry?: ComponentRegistry,
    errorBoundary?: ErrorBoundary
  ) {
    const renderStep = new RenderStep(registry, errorBoundary)
    const updateStep = new UpdateStep(registry, errorBoundary)
    this.steps = [
      new ResolveStep(),
      new MountStep(domAddressMap, runtimeAdapter, this.mountHandles),
      renderStep,
      updateStep,
      new UnmountStep(),
    ]
    this.rerenderSteps = [renderStep, updateStep]
  }

  async run(ctx: ComponentContext): Promise<void> {
    await this.runSteps(this.steps, ctx)
  }

  async rerender(ctx: ComponentContext): Promise<void> {
    await this.runSteps(this.rerenderSteps, ctx)
  }

  async unmount(ctx: ComponentContext): Promise<void> {
    const handle = this.mountHandles.get(ctx)
    if (!handle) {
      return
    }
    this.mountHandles.delete(ctx)
    handle.unmount()
  }

  private async runSteps(steps: readonly LifecycleStep[], ctx: ComponentContext): Promise<void> {
    for (const step of steps) {
      try {
        await step.execute(ctx)
      } catch (error) {
        throw new LifecycleError(step.name(), String(error))
      }
    }
  }
}
