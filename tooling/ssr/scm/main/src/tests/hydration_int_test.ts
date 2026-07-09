import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { adaptCustomElementRegistry } from "@justjs/application"
import type { LazyCustomElementRegistry } from "@justjs/application"
import { renderComponent } from "../core/renderer.js"

// Proves the ADR-0005 hydration claim: adaptCustomElementRegistry's existing
// reuse-by-`instanceof` branch (application/core/registry/
// component_registry_adapter.ts) fires against markup @justjs/ssr produced,
// once a browser (here, happy-dom) has parsed and upgraded it — no new
// hydration-specific code path was added to @justjs/application for this.
//
// Scope note (see ADR-0005 Consequences): happy-dom does not hoist a
// `<template shadowrootmode="open">` into a real, attached shadow root the
// way a browser does — confirmed by hand before writing this test (setting
// `.innerHTML` to SSR-shaped markup leaves the template as inert light-DOM
// content; the element's own connectedCallback is what actually produces a
// shadow root, exactly as it would on a second, un-hydrated client render).
// So this test proves DOM-node-identity reuse (the element instance survives,
// `container.replaceChildren()` is never called) — not that the server's
// exact shadow *content* survives without the class re-running its own
// render logic. That stronger claim isn't verifiable against this DOM
// implementation and isn't asserted here.
describe("SSR output hydrates through the existing adaptCustomElementRegistry reuse path (ADR-0005)", () => {
  beforeAll(() => {
    GlobalRegistrator.register()
  })

  afterAll(async () => {
    await GlobalRegistrator.unregister()
  })

  it("test_a_dom_node_parsed_from_ssr_output_is_reused_not_reconstructed_by_the_real_client_render_path", async () => {
    let connectedCount = 0
    class MockCounter extends HTMLElement {
      connectedCallback() {
        connectedCount++
        if (!this.shadowRoot) {
          this.attachShadow({ mode: "open" })
        }
        this.shadowRoot!.innerHTML = `<span>count:${this.getAttribute("count") ?? "0"}</span>`
      }
    }
    const load = async (): Promise<CustomElementConstructor> => MockCounter

    // 1. Server-side: @justjs/ssr renders the real class to a string.
    const rendered = await renderComponent("x-counter", load, { count: "5" })
    expect(rendered.html).toContain("<x-counter")
    expect(rendered.shadowDom).toBe("<span>count:5</span>")

    // 2. Client-side: a browser receives that HTML and parses/upgrades it -
    // simulated by assigning it into a connected container.
    document.body.innerHTML = `<div data-ddas-id="app:home:x-counter:root">${rendered.html}</div>`
    const rootContainer = document.querySelector('[data-ddas-id="app:home:x-counter:root"]')!
    const preHydrationChild = rootContainer.firstElementChild
    expect(preHydrationChild).not.toBeNull()
    expect(preHydrationChild).toBeInstanceOf(MockCounter)
    const connectedCountAfterParse = connectedCount
    expect(connectedCountAfterParse).toBeGreaterThan(0)

    // 3. boot()'s real client-side path: adaptCustomElementRegistry resolves
    // the SAME class (via the SAME `load` reference) and renders against the
    // SAME container - this is exactly what DefaultRouter/RenderStep drive
    // in production, not a hand-wired test-only substitute.
    const source: LazyCustomElementRegistry = { "x-counter": load }
    const registry = adaptCustomElementRegistry(source)
    const component = await registry.get("x-counter")
    await component.render({ count: "5" }, rootContainer)

    // The existing reuse branch fired: same node, not torn down and rebuilt.
    expect(rootContainer.firstElementChild).toBe(preHydrationChild)
    expect(rootContainer.children).toHaveLength(1)
  })

  it("test_a_foreign_or_missing_child_still_falls_back_to_constructing_a_fresh_element", async () => {
    // Negative case: if the container's existing child is NOT already an
    // instance of the resolved class (e.g. hydration markup never arrived,
    // or a different component previously occupied this container),
    // adaptCustomElementRegistry's existing fallback still constructs a
    // fresh element rather than reusing something foreign - unchanged by
    // ADR-0005, verified here so this test file doesn't only prove the
    // happy path.
    class MockBadge extends HTMLElement {
      connectedCallback() {
        if (!this.shadowRoot) this.attachShadow({ mode: "open" })
      }
    }
    // adaptCustomElementRegistry does `new ElementCtor()` with no
    // customElements.define() of its own (application/core/registry/
    // component_registry_adapter.ts) - a real DOM throws "Illegal
    // constructor" constructing an autonomous custom element class that was
    // never registered. Defining it here stands in for whatever step a real
    // app relies on to have already done this (today, an unverified
    // assumption - see this file's other test and the comment below it).
    customElements.define("x-badge", MockBadge)
    const load = async (): Promise<CustomElementConstructor> => MockBadge

    document.body.innerHTML = `<div data-ddas-id="app:home:x-badge:root"><span>unrelated</span></div>`
    const rootContainer = document.querySelector('[data-ddas-id="app:home:x-badge:root"]')!
    const foreignChild = rootContainer.firstElementChild

    const registry = adaptCustomElementRegistry({ "x-badge": load })
    const component = await registry.get("x-badge")
    await component.render({}, rootContainer)

    expect(rootContainer.firstElementChild).not.toBe(foreignChild)
    expect(rootContainer.firstElementChild).toBeInstanceOf(MockBadge)
  })
})
