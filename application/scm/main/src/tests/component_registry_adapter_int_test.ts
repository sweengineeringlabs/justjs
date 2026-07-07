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

    expect(Object.keys(registry).sort()).toEqual(["x-checkout", "x-home"])

    const component = await registry["x-home"]!()
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

    const component = await registry["x-home"]!()
    await component.render({ label: "Welcome", count: 3 }, container as unknown as Element)

    expect(constructed?.attributes).toEqual({ label: "Welcome", count: "3" })
  })

  it("test_adapter_attaches_constructed_element_into_the_given_container", async () => {
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = new FakeContainer()

    const component = await registry["x-home"]!()
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

    const component = await registry["x-home"]!()
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

  it("test_adapter_replaces_a_foreign_existing_child_instead_of_reusing_it", async () => {
    const source: LazyCustomElementRegistry = {
      "x-home": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    const registry = adaptCustomElementRegistry(source)
    const container = new FakeContainer()
    const foreignChild = { setAttribute() {} }
    container.replaceChildren(foreignChild)

    const component = await registry["x-home"]!()
    await component.render({ label: "value" }, container as unknown as Element)

    expect(container.children).toHaveLength(1)
    expect(container.children[0]).not.toBe(foreignChild)
    expect(container.children[0]).toBeInstanceOf(FakeCustomElement)
  })

  it("test_adapter_still_enforces_hyphenated_tag_names", () => {
    const source: LazyCustomElementRegistry = {
      nohyphen: () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
    }
    expect(() => adaptCustomElementRegistry(source)).toThrow(RegistryError)
  })

  it("test_adapter_leaves_an_unregistered_tag_absent", () => {
    const registry = adaptCustomElementRegistry({})
    expect(registry["x-missing"]).toBeUndefined()
  })
})
