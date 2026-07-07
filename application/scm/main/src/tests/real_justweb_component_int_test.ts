import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { adaptCustomElementRegistry, type LazyCustomElementRegistry } from "../core/registry/component_registry_adapter.js"
import { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
import type { ComponentContext } from "../api/component.js"
import type { DomAddressMap } from "../api/dom-address.js"

// justjs#39: proves the previously-unverified claim - that boot()'s
// resolution logic actually results in a REAL justweb-generated custom
// element being constructed and attached into the DOM, not just that
// fixture-shaped data satisfies TypeScript types. Uses happy-dom (a real
// DOM implementation, not a mock) and the captured real component fixture
// in ./fixtures/home_component.gen.ts.

describe("real justweb component integration", () => {
  beforeAll(() => {
    GlobalRegistrator.register()
  })

  afterAll(async () => {
    await GlobalRegistrator.unregister()
  })

  it("test_defaultlifecycle_mounts_a_real_justweb_component_into_a_live_dom_container", async () => {
    const source: LazyCustomElementRegistry = {
      "js-home": () => import("./fixtures/home_component.gen.js").then((m) => m.HomeBase),
    }
    const registry = adaptCustomElementRegistry(source)

    // Captured verbatim alongside the fixture component (same real
    // `justw generate app` run) - see justjs#45/#49.
    const domAddressMap: DomAddressMap = {
      app: "test-app",
      elements: {
        "test-app:home:home:button": { component: "home", feature: "home", interactive: true, scope: "public", tag: "js-home", type: "button" },
        "test-app:home:home:input": { component: "home", feature: "home", interactive: true, scope: "public", tag: "js-home", type: "input" },
        "test-app:home:home:label": { component: "home", feature: "home", interactive: false, scope: "public", tag: "js-home", type: "span" },
        "test-app:home:home:link": { component: "home", feature: "home", interactive: false, scope: "public", tag: "js-home", type: "a" },
      },
      schema: "1",
      version: "0.1.0",
    }

    const lifecycle = new DefaultLifecycle(domAddressMap, undefined, registry)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const ctx: ComponentContext = {
      tag: "js-home",
      props: { greeting: "Hello from a real DOM" },
      element: container,
    }

    await lifecycle.run(ctx)

    const mounted = container.querySelector("js-home")
    expect(mounted).not.toBeNull()
    expect(mounted?.tagName.toLowerCase()).toBe("js-home")
    // Proves the real justweb-generated connectedCallback actually ran (not
    // just that an element with the right tag name exists) - it sets these
    // itself, this test never does.
    expect(mounted?.getAttribute("role")).toBe("region")
    expect(mounted?.classList.contains("home")).toBe(true)
    // Proves attributeChangedCallback -> signal (justweb#52) actually fired
    // on a real, connected element - the whole reason adaptCustomElementRegistry
    // now reuses elements instead of always reconstructing.
    expect(mounted?.getAttribute("greeting")).toBe("Hello from a real DOM")
    expect((mounted as unknown as { greeting: { value: string } }).greeting.value).toBe(
      "Hello from a real DOM"
    )
  })

  it("test_second_render_reuses_the_same_live_element_and_updates_its_signal", async () => {
    const source: LazyCustomElementRegistry = {
      "js-home": () => import("./fixtures/home_component.gen.js").then((m) => m.HomeBase),
    }
    const registry = adaptCustomElementRegistry(source)
    const domAddressMap: DomAddressMap = {
      elements: {
        "test-app:home:home:button": { component: "home", tag: "js-home" },
      },
    }
    const lifecycle = new DefaultLifecycle(domAddressMap, undefined, registry)
    const container = document.createElement("div")
    document.body.appendChild(container)

    await lifecycle.run({ tag: "js-home", props: { greeting: "first" }, element: container })
    const firstElement = container.querySelector("js-home")
    await lifecycle.run({ tag: "js-home", props: { greeting: "second" }, element: container })
    const secondElement = container.querySelector("js-home")

    expect(secondElement).toBe(firstElement)
    expect((secondElement as unknown as { greeting: { value: string } }).greeting.value).toBe("second")
  })
})
