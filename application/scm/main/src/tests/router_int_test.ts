import { describe, it, expect, beforeAll, afterAll, afterEach, mock } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createFeatureStore } from "@justjs/data"
import { DefaultRouter } from "../core/registry/router.js"
import { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
import { DefaultComponentRegistry } from "../core/registry/component_registry.js"
import { RegistryError } from "../api/registry.js"
import type { DomAddressMap } from "../api/dom-address.js"
import type { Component } from "../api/component.js"

// justjs#56: DefaultRouter.navigate() previously only set a private field —
// it never resolved a real DOM element or drove the lifecycle. These prove
// it now does, against a real DOM (happy-dom), not a mock Element.

// ADR-0004: a store-triggered re-render runs through DefaultLifecycle.run()'s
// full async step chain - a fixed number of chained `await Promise.resolve()`
// microtask hops isn't reliably deep enough to guarantee it (and any
// following .catch()) has settled. A macrotask tick always runs after every
// currently-queued microtask has drained, regardless of chain depth.
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("DefaultRouter drives DefaultLifecycle against a real DOM", () => {
  beforeAll(() => {
    GlobalRegistrator.register()
  })

  afterAll(async () => {
    await GlobalRegistrator.unregister()
  })

  // Each test appends its own elements to document.body and never removes
  // them - without this, a later test's bare-tag querySelector fallback can
  // resolve to a stale element left behind by an earlier test instead of
  // its own freshly-created one.
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("test_navigate_resolves_a_ddas_stamped_element_and_renders_the_real_component", async () => {
    const rendered: { props: unknown; element: Element }[] = []
    const component: Component = {
      name: "dashboard",
      render(props, element) {
        rendered.push({ props, element })
      },
    }

    const registry = new DefaultComponentRegistry()
    registry.register("x-dashboard", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)

    const target = document.createElement("x-dashboard")
    target.setAttribute("data-ddas-id", "app:home:dashboard:root")
    document.body.appendChild(target)

    const domAddressMap: DomAddressMap = {
      elements: {
        "app:home:dashboard:root": { component: "dashboard", tag: "x-dashboard" },
      },
    }

    const router = new DefaultRouter(
      ["/dashboard"],
      { "x-dashboard": { path: "/dashboard", component: "dashboard" } },
      lifecycle,
      domAddressMap
    )

    await router.navigate("/dashboard")

    expect(router.currentPath()).toBe("/dashboard")
    expect(rendered).toHaveLength(1)
    expect(rendered[0]?.element).toBe(target)
  })

  it("test_navigate_falls_back_to_a_bare_tag_lookup_when_no_dom_address_map_supplied", async () => {
    const rendered: Element[] = []
    const component: Component = {
      name: "counter",
      render(_props, element) {
        rendered.push(element)
      },
    }

    const registry = new DefaultComponentRegistry()
    registry.register("x-counter", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)

    const target = document.createElement("x-counter")
    document.body.appendChild(target)

    const router = new DefaultRouter(
      ["/counter"],
      { "x-counter": { path: "/counter", component: "counter" } },
      lifecycle
    )

    await router.navigate("/counter")

    expect(rendered).toHaveLength(1)
    expect(rendered[0]).toBe(target)
  })

  it("test_navigate_rejects_a_route_not_in_the_known_routes_list", async () => {
    const lifecycle = new DefaultLifecycle()
    const router = new DefaultRouter(["/counter"], {}, lifecycle)

    await expect(router.navigate("/unknown")).rejects.toThrow(RegistryError)
  })

  it("test_navigate_rejects_when_no_matching_dom_element_exists", async () => {
    const lifecycle = new DefaultLifecycle()
    const router = new DefaultRouter(
      ["/missing"],
      { "x-missing": { path: "/missing", component: "missing" } },
      lifecycle
    )

    await expect(router.navigate("/missing")).rejects.toThrow(RegistryError)
  })

  it("test_navigate_extracts_dynamic_route_params_via_the_registry_entrys_params_mapping", async () => {
    const rendered: { props: unknown }[] = []
    const component: Component = {
      name: "order-detail",
      render(props) {
        rendered.push({ props })
      },
    }

    const registry = new DefaultComponentRegistry()
    registry.register("x-order-detail", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)

    document.body.appendChild(document.createElement("x-order-detail"))

    // Mirrors justweb routes.yaml's real params: shape - :id segment ->
    // order-detail's own declared `id` prop (docs/adr/ADR-0001).
    const router = new DefaultRouter(
      ["/order/:id"],
      { "x-order-detail": { path: "/order/:id", component: "order-detail", params: { id: "id" } } },
      lifecycle
    )

    await router.navigate("/order/42")

    expect(router.currentPath()).toBe("/order/42")
    expect(rendered).toHaveLength(1)
    expect(rendered[0]?.props).toEqual({ id: "42" })
  })

  it("test_navigate_rejects_a_path_with_the_wrong_number_of_segments_for_a_dynamic_route", async () => {
    const lifecycle = new DefaultLifecycle()
    const router = new DefaultRouter(
      ["/order/:id"],
      { "x-order-detail": { path: "/order/:id", component: "order-detail", params: { id: "id" } } },
      lifecycle
    )

    await expect(router.navigate("/order")).rejects.toThrow(RegistryError)
    await expect(router.navigate("/order/42/extra")).rejects.toThrow(RegistryError)
  })

  it("test_navigate_passes_a_constructor_supplied_feature_store_through_to_the_component (ADR-0003 D8)", async () => {
    const store = createFeatureStore({ visits: 0 }, (s) => s)
    let receivedStore: unknown

    const component: Component = {
      name: "dashboard",
      render(_props, _element, ctx) {
        receivedStore = ctx?.store
      },
    }

    const registry = new DefaultComponentRegistry()
    registry.register("x-dashboard", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)

    document.body.appendChild(document.createElement("x-dashboard"))

    const router = new DefaultRouter(
      ["/dashboard"],
      { "x-dashboard": { path: "/dashboard", component: "dashboard" } },
      lifecycle,
      undefined,
      store
    )

    await router.navigate("/dashboard")

    expect(receivedStore).toBe(store)
  })

  it("test_navigate_omits_store_and_eventBus_from_ctx_when_router_was_not_given_either", async () => {
    let ctxSeen: unknown
    const component: Component = {
      name: "dashboard",
      render(_props, _element, ctx) {
        ctxSeen = ctx
      },
    }

    const registry = new DefaultComponentRegistry()
    registry.register("x-dashboard", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)

    document.body.appendChild(document.createElement("x-dashboard"))

    const router = new DefaultRouter(
      ["/dashboard"],
      { "x-dashboard": { path: "/dashboard", component: "dashboard" } },
      lifecycle
    )

    await router.navigate("/dashboard")

    expect(ctxSeen).toBeUndefined()
  })

  it("test_a_store_dispatch_after_navigate_re_renders_the_same_element (ADR-0004)", async () => {
    const store = createFeatureStore<{ count: number }, { type: "INCREMENT" }>(
      { count: 0 },
      (state, action) => (action.type === "INCREMENT" ? { count: state.count + 1 } : state)
    )

    const rendered: { count: number | undefined; element: Element }[] = []
    const component: Component = {
      name: "dashboard",
      render(_props, element, ctx) {
        rendered.push({ count: (ctx?.store as typeof store | undefined)?.state.value.count, element })
      },
    }

    const registry = new DefaultComponentRegistry()
    registry.register("x-dashboard", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    const target = document.createElement("x-dashboard")
    document.body.appendChild(target)

    const router = new DefaultRouter(
      ["/dashboard"],
      { "x-dashboard": { path: "/dashboard", component: "dashboard" } },
      lifecycle,
      undefined,
      store
    )

    await router.navigate("/dashboard")
    expect(rendered).toHaveLength(1)
    expect(rendered[0]?.count).toBe(0)
    expect(rendered[0]?.element).toBe(target)

    // ACTUAL: dispatched directly against the store, not through the
    // router - proves the subscription (not a router method call) is what
    // triggers the re-render.
    store.dispatch({ type: "INCREMENT" })
    // subscribe() notifications fire synchronously (DefaultFeatureStore),
    // but the re-render itself is an async lifecycle.run() - flush it.
    await flush()

    expect(rendered).toHaveLength(2)
    expect(rendered[1]?.count).toBe(1)
    expect(rendered[1]?.element).toBe(target)
  })

  it("test_navigating_away_stops_the_previous_routes_component_from_re_rendering (ADR-0004)", async () => {
    const store = createFeatureStore<{ count: number }, { type: "INCREMENT" }>(
      { count: 0 },
      (state, action) => (action.type === "INCREMENT" ? { count: state.count + 1 } : state)
    )

    let dashboardRenderCount = 0
    const dashboardComponent: Component = {
      name: "dashboard",
      render() {
        dashboardRenderCount++
      },
    }
    const settingsComponent: Component = {
      name: "settings",
      render() {},
    }

    const registry = new DefaultComponentRegistry()
    registry.register("x-dashboard", () => dashboardComponent)
    registry.register("x-settings", () => settingsComponent)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)

    document.body.appendChild(document.createElement("x-dashboard"))
    document.body.appendChild(document.createElement("x-settings"))

    const router = new DefaultRouter(
      ["/dashboard", "/settings"],
      {
        "x-dashboard": { path: "/dashboard", component: "dashboard" },
        "x-settings": { path: "/settings", component: "settings" },
      },
      lifecycle,
      undefined,
      store
    )

    await router.navigate("/dashboard")
    expect(dashboardRenderCount).toBe(1)

    await router.navigate("/settings")
    // navigate() away renders settings once - dashboard should not have
    // rendered again as a side effect of leaving.
    expect(dashboardRenderCount).toBe(1)

    store.dispatch({ type: "INCREMENT" })
    await flush()

    // The dashboard's subscription must have been torn down when we
    // navigated away - a dispatch now must not reach it.
    expect(dashboardRenderCount).toBe(1)
  })

  it("test_an_error_during_a_store_triggered_rerender_is_logged_not_unhandled (ADR-0004)", async () => {
    const store = createFeatureStore<{ count: number }, { type: "INCREMENT" }>(
      { count: 0 },
      (state, action) => (action.type === "INCREMENT" ? { count: state.count + 1 } : state)
    )

    let renderCalls = 0
    const component: Component = {
      name: "dashboard",
      render() {
        renderCalls++
        if (renderCalls > 1) {
          throw new Error("boom")
        }
      },
    }

    const registry = new DefaultComponentRegistry()
    registry.register("x-dashboard", () => component)
    const lifecycle = new DefaultLifecycle(undefined, undefined, registry)
    document.body.appendChild(document.createElement("x-dashboard"))

    const router = new DefaultRouter(
      ["/dashboard"],
      { "x-dashboard": { path: "/dashboard", component: "dashboard" } },
      lifecycle,
      undefined,
      store
    )

    await router.navigate("/dashboard")

    const originalError = console.error
    const errorSpy = mock(() => {})
    console.error = errorSpy

    try {
      store.dispatch({ type: "INCREMENT" })
      await flush()
    } finally {
      console.error = originalError
    }

    expect(errorSpy).toHaveBeenCalled()
  })

  it("test_a_store_triggered_rerender_does_not_repeat_the_runtime_adapters_mount_side_effect (justjs#65)", async () => {
    const store = createFeatureStore<{ count: number }, { type: "INCREMENT" }>(
      { count: 0 },
      (state, action) => (action.type === "INCREMENT" ? { count: state.count + 1 } : state)
    )

    const mounted: string[] = []
    const runtimeAdapter = {
      mount(ddasId: string) {
        mounted.push(ddasId)
        return { unmount() {} }
      },
    }
    let renderCount = 0
    const component: Component = {
      name: "dashboard",
      render() {
        renderCount++
      },
    }

    const registry = new DefaultComponentRegistry()
    registry.register("x-dashboard", () => component)
    const domAddressMap: DomAddressMap = {
      elements: { "app:home:dashboard:root": { component: "dashboard", tag: "x-dashboard" } },
    }
    const lifecycle = new DefaultLifecycle(domAddressMap, runtimeAdapter, registry)

    const target = document.createElement("x-dashboard")
    target.setAttribute("data-ddas-id", "app:home:dashboard:root")
    document.body.appendChild(target)

    const router = new DefaultRouter(
      ["/dashboard"],
      { "x-dashboard": { path: "/dashboard", component: "dashboard" } },
      lifecycle,
      domAddressMap,
      store
    )

    await router.navigate("/dashboard")
    expect(mounted).toHaveLength(1)
    expect(renderCount).toBe(1)

    store.dispatch({ type: "INCREMENT" })
    await flush()
    store.dispatch({ type: "INCREMENT" })
    await flush()

    // The real ADR-0004 store-subscription path, not a direct rerender()
    // call - proves DefaultRouter itself calls rerender(), not run(), for
    // its store-triggered re-render.
    expect(mounted).toHaveLength(1)
    expect(renderCount).toBe(3)
  })

  it("test_navigating_to_a_different_route_unmounts_the_previous_routes_mount_handle (justjs#67)", async () => {
    const dashboardUnmounts: number[] = []
    const settingsUnmounts: number[] = []
    const runtimeAdapter = {
      mount(ddasId: string) {
        return {
          unmount() {
            if (ddasId === "app:home:dashboard:root") dashboardUnmounts.push(1)
            if (ddasId === "app:home:settings:root") settingsUnmounts.push(1)
          },
        }
      },
    }
    const registry = new DefaultComponentRegistry()
    registry.register("x-dashboard", () => ({ name: "dashboard", render() {} }))
    registry.register("x-settings", () => ({ name: "settings", render() {} }))
    const domAddressMap: DomAddressMap = {
      elements: {
        "app:home:dashboard:root": { component: "dashboard", tag: "x-dashboard" },
        "app:home:settings:root": { component: "settings", tag: "x-settings" },
      },
    }
    const lifecycle = new DefaultLifecycle(domAddressMap, runtimeAdapter, registry)

    const dashboardTarget = document.createElement("x-dashboard")
    dashboardTarget.setAttribute("data-ddas-id", "app:home:dashboard:root")
    document.body.appendChild(dashboardTarget)
    const settingsTarget = document.createElement("x-settings")
    settingsTarget.setAttribute("data-ddas-id", "app:home:settings:root")
    document.body.appendChild(settingsTarget)

    const router = new DefaultRouter(
      ["/dashboard", "/settings"],
      {
        "x-dashboard": { path: "/dashboard", component: "dashboard" },
        "x-settings": { path: "/settings", component: "settings" },
      },
      lifecycle,
      domAddressMap
    )

    await router.navigate("/dashboard")
    expect(dashboardUnmounts).toHaveLength(0)

    await router.navigate("/settings")
    // Leaving /dashboard for a genuinely different route unmounts its handle.
    expect(dashboardUnmounts).toHaveLength(1)
    expect(settingsUnmounts).toHaveLength(0)
  })

  it("test_renavigating_to_the_same_route_does_not_unmount (justjs#67)", async () => {
    const unmounts: number[] = []
    const runtimeAdapter = {
      mount() {
        return {
          unmount() {
            unmounts.push(1)
          },
        }
      },
    }
    const registry = new DefaultComponentRegistry()
    registry.register("x-dashboard", () => ({ name: "dashboard", render() {} }))
    const domAddressMap: DomAddressMap = {
      elements: { "app:home:dashboard:root": { component: "dashboard", tag: "x-dashboard" } },
    }
    const lifecycle = new DefaultLifecycle(domAddressMap, runtimeAdapter, registry)

    const target = document.createElement("x-dashboard")
    target.setAttribute("data-ddas-id", "app:home:dashboard:root")
    document.body.appendChild(target)

    const router = new DefaultRouter(
      ["/dashboard"],
      { "x-dashboard": { path: "/dashboard", component: "dashboard" } },
      lifecycle,
      domAddressMap
    )

    await router.navigate("/dashboard")
    await router.navigate("/dashboard")

    // Re-navigating to the same route re-renders in place, matching
    // adaptCustomElementRegistry's element-reuse behavior - it must not be
    // treated as a tear-down-and-remount.
    expect(unmounts).toHaveLength(0)
  })
})
