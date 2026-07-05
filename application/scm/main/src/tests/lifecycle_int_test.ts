import { describe, it, expect } from "bun:test"
import { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
import type { ComponentContext, RuntimeAdapter, MountHandle } from "../api/component.js"

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
    const domAddressMap = { "x-button": ["app:home:x-button:root"] }
    const lifecycle = new DefaultLifecycle(domAddressMap, runtimeAdapter)
    const element = { tagName: "div" } as unknown as Element
    const ctx: ComponentContext = { tag: "x-button", props: {}, element }

    await lifecycle.run(ctx)

    expect(mounted).toHaveLength(1)
    expect(mounted[0]?.ddasId).toBe("app:home:x-button:root")
    expect(mounted[0]?.element).toBe(element)
  })

  it("test_mount_step_fails_without_ddas_entry_for_tag", async () => {
    const domAddressMap = { "x-other": ["app:home:x-other:root"] }
    const lifecycle = new DefaultLifecycle(domAddressMap)
    const ctx: ComponentContext = {
      tag: "x-button",
      props: {},
      element: { tagName: "div" } as unknown as Element,
    }

    await expect(lifecycle.run(ctx)).rejects.toThrow()
  })
})
