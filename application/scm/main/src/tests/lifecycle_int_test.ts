import { describe, it, expect } from "bun:test"
import { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
import type { ComponentContext } from "../api/component.js"

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
})
