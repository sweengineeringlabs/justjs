import { describe, it, expect } from "bun:test"
import { DefaultFeatureStore, DefaultUIEventBus } from "@justjs/data"
import { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
import { DefaultComponentRegistry } from "../core/registry/component_registry.js"
import type {
  ComponentContext,
  ComponentDataContext,
  RuntimeAdapter,
  MountHandle,
  Component,
  ComponentProps,
} from "../api/component.js"
import type { DomAddressMap } from "../api/dom-address.js"

describe("lifecycle", () => {
  it("test_lifecycle_runs_all_steps", async () => {
    const lifecycle = new DefaultLifecycle()
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await lifecycle.run(ctx)
  })

  it("test_lifecycle_fails_without_tag", async () => {
    const lifecycle = new DefaultLifecycle()
    const ctx: ComponentContext = {
      tag: "",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    expect(async () => {
      await lifecycle.run(ctx)
    }).toThrow()
  })

  it("test_lifecycle_fails_without_element", async () => {
    const lifecycle = new DefaultLifecycle()
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: null as unknown as Element,
    }

    expect(async () => {
      await lifecycle.run(ctx)
    }).toThrow()
  })

  it("test_mount_step_resolves_ddas_id_before_calling_runtime_adapter", async () => {
    const mounted: Array<{ ddasId: string; element: Element }> = []
    const runtimeAdapter: RuntimeAdapter = {
      mount(ddasId: string, element: Element): MountHandle {
        mounted.push({ ddasId, element })
        return { unmount() {} }
      },
    }
    const domAddressMap: DomAddressMap = {
      elements: { "app:home:x-button:root": { component: "button", tag: "x-button" } },
    }
    const lifecycle = new DefaultLifecycle(domAddressMap, runtimeAdapter)
    const element = { tagName: "div" } as unknown as Element
    const ctx: ComponentContext = { tag: "x-button", props: {}, element }

    await lifecycle.run(ctx)

    expect(mounted).toHaveLength(1)
    expect(mounted[0]?.ddasId).toBe("app:home:x-button:root")
    expect(mounted[0]?.element).toBe(element)
  })

  it("test_mount_step_resolves_against_a_real_justweb_generated_dom_address_map", async () => {
    // Captured verbatim from a real `justw init test-app --features home` +
    // `justw generate app` run (justjs#39/#49, justweb#56) - not a
    // hand-authored fixture, so this catches shape drift that self-consistent
    // hand-written fixtures above cannot.
    const realGeneratedDomAddressMap: DomAddressMap = {
      app: "test-app",
      elements: {
        "test-app:home:home:button": {
          component: "home",
          feature: "home",
          interactive: true,
          scope: "public",
          tag: "js-home",
          type: "button",
        },
        "test-app:home:home:input": {
          component: "home",
          feature: "home",
          interactive: true,
          scope: "public",
          tag: "js-home",
          type: "input",
        },
        "test-app:home:home:label": {
          component: "home",
          feature: "home",
          interactive: false,
          scope: "public",
          tag: "js-home",
          type: "span",
        },
        "test-app:home:home:link": {
          component: "home",
          feature: "home",
          interactive: false,
          scope: "public",
          tag: "js-home",
          type: "a",
        },
      },
      schema: "1",
      version: "0.1.0",
    }
    const mounted: Array<{ ddasId: string; element: Element }> = []
    const runtimeAdapter: RuntimeAdapter = {
      mount(ddasId: string, element: Element): MountHandle {
        mounted.push({ ddasId, element })
        return { unmount() {} }
      },
    }
    const lifecycle = new DefaultLifecycle(realGeneratedDomAddressMap, runtimeAdapter)
    const element = { tagName: "div" } as unknown as Element
    // "js-home" is the real registered tag (registry.gen.ts/component-registry.gen.ts),
    // not "home" (the bare *_component.yaml name real dom-address-map.json also carries).
    const ctx: ComponentContext = { tag: "js-home", props: {}, element }

    await lifecycle.run(ctx)

    expect(mounted).toHaveLength(1)
    expect(mounted[0]?.ddasId).toBe("test-app:home:home:button")
  })

  it("test_mount_step_rejects_domaddressmap_missing_elements_with_a_clear_error", async () => {
    // The legacy pre-migration shape (a flat Record<tag, string[]>) has no
    // `elements` property at all - confirm this fails with an actionable
    // LifecycleError, not a raw "Object.entries requires..." TypeError.
    const legacyShapeMap = { "x-button": ["main"] } as unknown as DomAddressMap
    const lifecycle = new DefaultLifecycle(legacyShapeMap)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await expect(lifecycle.run(ctx)).rejects.toThrow(/elements/)
  })

  it("test_mount_step_rejects_a_domaddressmap_with_no_tag_field_on_any_element", async () => {
    // Every element present but none carry `tag` - the signature of output
    // generated before justweb#56. Must fail with a distinct, actionable
    // message, not the generic "No DDAS entry found" per-tag message that
    // would otherwise make this look like a real per-component gap.
    const preTagFixMap: DomAddressMap = {
      elements: { "app:home:x-button:root": { component: "button" } },
    }
    const lifecycle = new DefaultLifecycle(preTagFixMap)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await expect(lifecycle.run(ctx)).rejects.toThrow(/justweb#56/)
  })

  it("test_mount_step_fails_without_ddas_entry_for_tag", async () => {
    const domAddressMap: DomAddressMap = {
      elements: { "app:home:x-other:root": { component: "other", tag: "x-other" } },
    }
    const lifecycle = new DefaultLifecycle(domAddressMap)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await expect(lifecycle.run(ctx)).rejects.toThrow()
  })

  it("test_render_step_calls_resolved_components_render_with_props", async () => {
    const renderCalls: ComponentProps[] = []
    const component: Component = {
      name: "x-button",
      render(props: ComponentProps): void {
        renderCalls.push(props)
      },
    }
    const registry = new DefaultComponentRegistry()
    registry.register("x-button", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: { label: "Click me" },
      element: { tagName: "div" } as unknown as Element,
    }

    await lifecycle.run(ctx)

    expect(renderCalls).toHaveLength(1)
    expect(renderCalls[0]).toEqual({ label: "Click me" })
  })

  it("test_render_and_update_steps_pass_ctx_element_to_the_component", async () => {
    const renderElements: Element[] = []
    const updateElements: Element[] = []
    const component: Component = {
      name: "x-button",
      render(_props: ComponentProps, element: Element): void {
        renderElements.push(element)
      },
      update(_props: ComponentProps, element: Element): void {
        updateElements.push(element)
      },
    }
    const registry = new DefaultComponentRegistry()
    registry.register("x-button", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const element = { tagName: "div" } as unknown as Element
    const ctx: ComponentContext = { tag: "x-button", props: {}, element }

    await lifecycle.run(ctx)

    expect(renderElements).toHaveLength(1)
    expect(renderElements[0]).toBe(element)
    expect(updateElements).toHaveLength(1)
    expect(updateElements[0]).toBe(element)
  })

  it("test_render_and_update_steps_pass_a_real_store_and_event_bus_through_ctx", async () => {
    const renderContexts: (ComponentDataContext | undefined)[] = []
    const updateContexts: (ComponentDataContext | undefined)[] = []
    const component: Component = {
      name: "x-button",
      render(_props, _element, ctx) {
        renderContexts.push(ctx)
      },
      update(_props, _element, ctx) {
        updateContexts.push(ctx)
      },
    }
    const registry = new DefaultComponentRegistry()
    registry.register("x-button", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)

    const store = new DefaultFeatureStore({ count: 0 }, (s) => s)
    const eventBus = new DefaultUIEventBus()
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
      store,
      eventBus,
    }

    await lifecycle.run(ctx)

    expect(renderContexts).toHaveLength(1)
    expect(renderContexts[0]?.store).toBe(store)
    expect(renderContexts[0]?.eventBus).toBe(eventBus)
    expect(updateContexts).toHaveLength(1)
    expect(updateContexts[0]?.store).toBe(store)
    expect(updateContexts[0]?.eventBus).toBe(eventBus)
  })

  it("test_render_step_passes_undefined_data_context_when_ctx_has_no_store_or_event_bus", async () => {
    const renderContexts: (ComponentDataContext | undefined)[] = []
    const component: Component = {
      name: "x-button",
      render(_props, _element, ctx) {
        renderContexts.push(ctx)
      },
    }
    const registry = new DefaultComponentRegistry()
    registry.register("x-button", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await lifecycle.run(ctx)

    expect(renderContexts).toHaveLength(1)
    expect(renderContexts[0]).toBeUndefined()
  })

  it("test_render_step_fails_when_tag_has_no_registered_component", async () => {
    const registry = new DefaultComponentRegistry()
    registry.register("x-other", () => ({ name: "x-other", render() {} }))
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await expect(lifecycle.run(ctx)).rejects.toThrow()
  })

  it("test_update_step_calls_components_update_hook_with_props", async () => {
    const updateCalls: ComponentProps[] = []
    const component: Component = {
      name: "x-button",
      render() {},
      update(props: ComponentProps): void {
        updateCalls.push(props)
      },
    }
    const registry = new DefaultComponentRegistry()
    registry.register("x-button", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: { label: "Updated" },
      element: { tagName: "div" } as unknown as Element,
    }

    await lifecycle.run(ctx)

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]).toEqual({ label: "Updated" })
  })

  it("test_render_and_update_steps_share_a_single_component_resolution_per_run", async () => {
    // RenderStep and UpdateStep both need the same component within one
    // run() pass. DefaultComponentRegistry.get() memoizes per tag, so this
    // proves the factory is invoked once, not once per step.
    let factoryCalls = 0
    const component: Component = { name: "x-button", render() {}, update() {} }
    const registry = new DefaultComponentRegistry()
    registry.register("x-button", () => {
      factoryCalls++
      return component
    })
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await lifecycle.run(ctx)
    await lifecycle.run(ctx)

    expect(factoryCalls).toBe(1)
  })

  it("test_update_step_is_noop_when_component_has_no_update_hook", async () => {
    const component: Component = {
      name: "x-button",
      render() {},
    }
    const registry = new DefaultComponentRegistry()
    registry.register("x-button", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await expect(lifecycle.run(ctx)).resolves.toBeUndefined()
  })
})
