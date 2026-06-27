import { describe, it, expect } from "bun:test"
import { DefaultComponentRegistry } from "../core/registry/component_registry.js"
import { RegistryError } from "../api/api_registry.js"
import type { Component } from "../api/api_component.js"

describe("component registry", () => {
  it("test_register_and_get_component", async () => {
    const registry = new DefaultComponentRegistry()
    const mockComponent: Component = { name: "test", render: () => {} }
    
    registry.register("x-button", () => mockComponent)
    const retrieved = await registry.get("x-button")

    expect(retrieved).toBe(mockComponent)
  })

  it("test_get_nonexistent_component_throws_error", async () => {
    const registry = new DefaultComponentRegistry()

    expect(async () => {
      await registry.get("x-missing")
    }).toThrow(RegistryError)
  })

  it("test_register_invalid_tag_throws_error", () => {
    const registry = new DefaultComponentRegistry()

    expect(() => {
      registry.register("button", () => ({ name: "button", render: () => {} }))
    }).toThrow(RegistryError)
  })

  it("test_has_component", () => {
    const registry = new DefaultComponentRegistry()
    
    registry.register("x-card", () => ({ name: "card", render: () => {} }))

    expect(registry.has("x-card")).toBe(true)
    expect(registry.has("x-missing")).toBe(false)
  })

  it("test_list_components", () => {
    const registry = new DefaultComponentRegistry()
    
    registry.register("x-button", () => ({ name: "button", render: () => {} }))
    registry.register("x-card", () => ({ name: "card", render: () => {} }))

    const list = registry.list()
    expect(list).toContain("x-button")
    expect(list).toContain("x-card")
  })
})
