import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { adaptCustomElementRegistry } from "../core/registry/component_registry_adapter.js"
import { RegistryError, type LazyCustomElementRegistry } from "../api/registry.js"

class FakeCustomElement {
  readonly attributes: Record<string, string> = {}
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }
  removeAttribute(name: string): void {
    delete this.attributes[name]
  }
}

class FakeContainer {
  children: unknown[] = []
  get firstElementChild(): unknown {
    return this.children[0] ?? null
  }
  replaceChildren(...nodes: unknown[]): void {
    this.children = nodes
  }
}

describe("component_registry_adapter", () => {
  it("test_adapter_resolves_the_correct_factory_for_a_given_tag", async () => {
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
      "x-checkout": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)

    expect(registry.has("x-home")).toBe(true)
    expect(registry.has("x-checkout")).toBe(true)
    expect(registry.list().sort()).toEqual(["x-checkout", "x-home"])

    const component = await registry.get("x-home")
    expect(component.name).toBe("x-home")
  })

  it("test_adapter_applies_props_as_attributes_when_component_renders", async () => {
    let constructed: FakeCustomElement | undefined
    class TrackedElement extends FakeCustomElement {
      constructor() {
        super()
        constructed = this
      }
    }
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(TrackedElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = new FakeContainer()

    const component = await registry.get("x-home")
    await component.render({ label: "Welcome", count: 3 }, container as unknown as Element)

    expect(constructed?.attributes).toEqual({ label: "Welcome", count: "3" })
  })

  it("test_adapter_attaches_constructed_element_into_the_given_container", async () => {
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = new FakeContainer()

    const component = await registry.get("x-home")
    await component.render({}, container as unknown as Element)

    expect(container.children).toHaveLength(1)
    expect(container.children[0]).toBeInstanceOf(FakeCustomElement)
  })

  it("test_adapter_reuses_existing_element_across_repeated_renders", async () => {
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = new FakeContainer()

    const component = await registry.get("x-home")
    await component.render({ label: "first" }, container as unknown as Element)
    const firstElement = container.children[0]
    await component.render({ label: "second" }, container as unknown as Element)

    // Same element instance reused (justweb#52 makes setAttribute on an
    // already-connected element meaningful for declared props, not inert) -
    // not just "still one child", which a reconstruct-every-time
    // implementation would also satisfy.
    expect(container.children).toHaveLength(1)
    expect(container.children[0]).toBe(firstElement)
    expect((container.children[0] as FakeCustomElement).attributes).toEqual({ label: "second" })
  })

  it("test_adapter_removes_attributes_absent_from_a_later_render_on_the_reused_element", async () => {
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = new FakeContainer()

    const component = await registry.get("x-home")
    await component.render({ label: "first", disabled: true }, container as unknown as Element)
    await component.render({ label: "second" }, container as unknown as Element)

    // `disabled` was present on the first render and omitted on the second -
    // it must be actively removed, not left stale on the reused element.
    expect((container.children[0] as FakeCustomElement).attributes).toEqual({ label: "second" })
  })

  it("test_adapter_replaces_a_foreign_existing_child_instead_of_reusing_it", async () => {
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = new FakeContainer()
    const foreignChild = { setAttribute() {} }
    container.replaceChildren(foreignChild)

    const component = await registry.get("x-home")
    await component.render({ label: "value" }, container as unknown as Element)

    expect(container.children).toHaveLength(1)
    expect(container.children[0]).not.toBe(foreignChild)
    expect(container.children[0]).toBeInstanceOf(FakeCustomElement)
  })

  it("test_adapter_still_enforces_hyphenated_tag_names", () => {
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    expect(() => registry.register("nohyphen", () => ({ name: "nohyphen", render() {} }))).toThrow(RegistryError)
  })

  it("test_adapter_get_rejects_unregistered_tag", async () => {
    const registry = adaptCustomElementRegistry({})
    await expect(registry.get("x-missing")).rejects.toThrow(RegistryError)
  })
})

// Every test above uses FakeCustomElement/FakeContainer - plain JS classes,
// not real HTMLElement subclasses. `new FakeCustomElement()` is unconditionally
// legal, so none of them exercise what a real DOM actually does when
// constructing an autonomous custom element class. That gap let a real bug
// ship silently (justjs#64): against a real DOM, `new ElementCtor()` throws
// "Illegal constructor" unless `customElements.define()` has already run for
// that class - confirmed by hand while building ADR-0005. This block runs
// the same adapter against a real `happy-dom` DOM and a genuine
// `HTMLElement` subclass, deliberately never registered by the test itself,
// to prove the adapter's own guarded `customElements.define()` call (added
// to fix justjs#64) is what makes construction succeed.
describe("component_registry_adapter against a real DOM (justjs#64 regression)", () => {
  beforeAll(() => {
    GlobalRegistrator.register()
  })

  afterAll(async () => {
    await GlobalRegistrator.unregister()
  })

  it("test_adapter_constructs_a_real_never_registered_custom_element_class_without_throwing", async () => {
    let connectedCount = 0
    class RealCounter extends HTMLElement {
      connectedCallback() {
        connectedCount++
        const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" })
        shadow.innerHTML = `<span>${this.getAttribute("count") ?? "0"}</span>`
      }
    }
    // Deliberately no customElements.define("x-real-counter", RealCounter)
    // here - proving the adapter itself handles it, not the test.
    const source: LazyCustomElementRegistry = {
      "x-real-counter": () => Promise.resolve(RealCounter as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = document.createElement("div")
    document.body.appendChild(container) // connectedCallback only fires once actually connected

    const component = await registry.get("x-real-counter")
    await component.render({ count: "5" }, container)

    expect(container.children).toHaveLength(1)
    expect(container.firstElementChild).toBeInstanceOf(RealCounter)
    expect(connectedCount).toBe(1)
    expect(container.firstElementChild?.shadowRoot?.innerHTML).toBe("<span>5</span>")
  })

  it("test_adapter_reuses_the_real_instance_across_repeated_renders_against_a_real_dom", async () => {
    class RealBadge extends HTMLElement {
      connectedCallback() {
        if (!this.shadowRoot) this.attachShadow({ mode: "open" })
      }
    }
    const source: LazyCustomElementRegistry = {
      "x-real-badge": () => Promise.resolve(RealBadge as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = document.createElement("div")
    document.body.appendChild(container)

    const component = await registry.get("x-real-badge")
    await component.render({ label: "first" }, container)
    const firstElement = container.firstElementChild
    await component.render({ label: "second" }, container)

    expect(container.firstElementChild).toBe(firstElement)
    expect(container.firstElementChild?.getAttribute("label")).toBe("second")
  })

  it("test_adapter_does_not_throw_when_the_same_tag_is_resolved_a_second_time", async () => {
    // A second adaptCustomElementRegistry() call for the same tag+class must
    // not hit customElements.define()'s "already defined" error - the
    // adapter's own customElements.get(tag) guard must handle this, since a
    // real app's boot() can plausibly build more than one registry instance
    // against the same underlying LazyCustomElementRegistry.
    class RealPanel extends HTMLElement {
      connectedCallback() {
        if (!this.shadowRoot) this.attachShadow({ mode: "open" })
      }
    }
    const load = () => Promise.resolve(RealPanel as unknown as CustomElementConstructor)

    const firstRegistry = adaptCustomElementRegistry({ "x-real-panel": load })
    const firstComponent = await firstRegistry.get("x-real-panel")
    firstComponent.render({}, document.createElement("div"))

    const secondRegistry = adaptCustomElementRegistry({ "x-real-panel": load })
    const secondComponent = await secondRegistry.get("x-real-panel")
    // render() is synchronous (void, not Promise<void>) - a synchronous
    // "already defined" DOMException would throw here directly, not as a
    // rejected promise, so this must be a sync throw assertion, not `.rejects`.
    expect(() => secondComponent.render({}, document.createElement("div"))).not.toThrow()
  })

  // justjs#71: ADR-0004's re-render mechanism depends entirely on a
  // component reading fresh state off ctx.store itself - but this render()
  // used to only declare 2 params, silently discarding RenderStep's 3rd
  // (dataContext) argument, so no customElements-registered component ever
  // had a way to receive it. This proves the fix: a real custom element
  // that defines its own `set dataContext(ctx)` accessor (the same
  // get/set-accessor idiom justweb codegen already uses for declared
  // props/states) actually receives fresh store state on every render call,
  // not just the first.
  it("test_adapter_forwards_data_context_to_an_element_that_defines_a_dataContext_setter", async () => {
    const receivedContexts: unknown[] = []
    class RealStoreConsumer extends HTMLElement {
      set dataContext(ctx: unknown) {
        receivedContexts.push(ctx)
      }
    }
    const source: LazyCustomElementRegistry = {
      "x-store-consumer": () => Promise.resolve(RealStoreConsumer as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const component = await registry.get("x-store-consumer")

    const firstContext = { store: { state: { value: 1 } } }
    await component.render({}, container, firstContext as never)
    const secondContext = { store: { state: { value: 2 } } }
    await component.render({}, container, secondContext as never)

    // Two distinct calls received, not just the last one cached - proves
    // each render() call actually forwards its own dataContext argument
    // rather than e.g. capturing it once at construction time.
    expect(receivedContexts).toEqual([firstContext, secondContext])
  })

  it("test_adapter_forwards_undefined_data_context_when_none_is_supplied", async () => {
    let received: unknown = "not-called"
    class RealOptionalConsumer extends HTMLElement {
      set dataContext(ctx: unknown) {
        received = ctx
      }
    }
    const source: LazyCustomElementRegistry = {
      "x-optional-consumer": () => Promise.resolve(RealOptionalConsumer as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = document.createElement("div")
    document.body.appendChild(container)
    const component = await registry.get("x-optional-consumer")

    await component.render({}, container)

    expect(received).toBeUndefined()
  })
})
