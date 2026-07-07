import { describe, it, expect } from "bun:test"
import { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
import type { ComponentContext, RuntimeAdapter, MountHandle, Component, ComponentProps } from "../api/component.js"
import type { ComponentRegistry } from "../api/registry.js"
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
      elements: { "app:home:x-button:root": { component: "x-button" } },
    }
    const lifecycle = new DefaultLifecycle(domAddressMap, runtimeAdapter)
    const element = { tagName: "div" } as unknown as Element
    const ctx: ComponentContext = { tag: "x-button", props: {}, element }

    await lifecycle.run(ctx)

    expect(mounted).toHaveLength(1)
    expect(mounted[0]?.ddasId).toBe("app:home:x-button:root")
    expect(mounted[0]?.element).toBe(element)
  })

  it("test_mount_step_fails_without_ddas_entry_for_tag", async () => {
    const domAddressMap: DomAddressMap = {
      elements: { "app:home:x-other:root": { component: "x-other" } },
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
    const registry: ComponentRegistry = {
      "x-button": () => component,
    }
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
    const registry: ComponentRegistry = { "x-button": () => component }
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const element = { tagName: "div" } as unknown as Element
    const ctx: ComponentContext = { tag: "x-button", props: {}, element }

    await lifecycle.run(ctx)

    expect(renderElements).toHaveLength(1)
    expect(renderElements[0]).toBe(element)
    expect(updateElements).toHaveLength(1)
    expect(updateElements[0]).toBe(element)
  })

  it("test_render_step_fails_when_tag_has_no_registered_component", async () => {
    const registry: ComponentRegistry = {
      "x-other": () => ({ name: "x-other", render() {} }),
    }
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
    const registry: ComponentRegistry = { "x-button": () => component }
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

  it("test_update_step_is_noop_when_component_has_no_update_hook", async () => {
    const component: Component = {
      name: "x-button",
      render() {},
    }
    const registry: ComponentRegistry = { "x-button": () => component }
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await expect(lifecycle.run(ctx)).resolves.toBeUndefined()
  })
})
