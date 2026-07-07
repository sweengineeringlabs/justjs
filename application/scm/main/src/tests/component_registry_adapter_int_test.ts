import { describe, it, expect } from "bun:test"
import { adaptCustomElementRegistry, type LazyCustomElementRegistry } from "../core/registry/component_registry_adapter.js"
import { RegistryError } from "../api/registry.js"

class FakeCustomElement {
  readonly attributes: Record<string, string> = {}
  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
  }
}

class FakeContainer {
  children: unknown[] = []
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

  it("test_adapter_render_is_idempotent_across_repeated_calls", async () => {
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = new FakeContainer()

    const component = await registry.get("x-home")
    await component.render({ label: "first" }, container as unknown as Element)
    await component.render({ label: "second" }, container as unknown as Element)

    expect(container.children).toHaveLength(1)
    expect((container.children[0] as FakeCustomElement).attributes).toEqual({ label: "second" })
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
