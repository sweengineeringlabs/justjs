import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { DefaultFeatureStore } from "@justjs/data"
import { DefaultRouter } from "../core/registry/router.js"
import { DefaultLifecycle } from "../core/lifecycle/lifecycle_pipeline.js"
import { DefaultComponentRegistry } from "../core/registry/component_registry.js"
import { RegistryError } from "../api/registry.js"
import type { DomAddressMap } from "../api/dom-address.js"
import type { Component } from "../api/component.js"

// justjs#56: DefaultRouter.navigate() previously only set a private field —
// it never resolved a real DOM element or drove the lifecycle. These prove
// it now does, against a real DOM (happy-dom), not a mock Element.

describe("DefaultRouter drives DefaultLifecycle against a real DOM", () => {
  beforeAll(() => {
    GlobalRegistrator.register()
  })

  afterAll(async () => {
    await GlobalRegistrator.unregister()
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
    const store = new DefaultFeatureStore({ visits: 0 }, (s) => s)
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
})
