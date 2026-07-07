import { describe, it, expect } from "bun:test"
import { DefaultComponentRegistry } from "../core/registry/component_registry.js"
import { RegistryError } from "../api/registry.js"
import type { Component } from "../api/component.js"

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

  it("test_get_memoizes_and_only_invokes_the_factory_once_per_tag", async () => {
    const registry = new DefaultComponentRegistry()
    let factoryCalls = 0
    registry.register("x-button", () => {
      factoryCalls++
      return { name: "button", render: () => {} }
    })

    const first = await registry.get("x-button")
    const second = await registry.get("x-button")
    const third = await registry.get("x-button", { label: "different props" })

    expect(factoryCalls).toBe(1)
    expect(second).toBe(first)
    expect(third).toBe(first)
  })

  it("test_get_does_not_permanently_cache_a_factory_rejection", async () => {
    const registry = new DefaultComponentRegistry()
    let attempt = 0
    registry.register("x-button", () => {
      attempt++
      if (attempt === 1) {
        throw new Error("transient failure")
      }
      return { name: "button", render: () => {} }
    })

    await expect(registry.get("x-button")).rejects.toThrow("transient failure")
    const recovered = await registry.get("x-button")

    expect(attempt).toBe(2)
    expect(recovered.name).toBe("button")
  })

  it("test_register_invalidates_any_previously_cached_resolution", async () => {
    const registry = new DefaultComponentRegistry()
    const original: Component = { name: "original", render: () => {} }
    const replacement: Component = { name: "replacement", render: () => {} }
    registry.register("x-button", () => original)
    await registry.get("x-button")

    registry.register("x-button", () => replacement)
    const resolved = await registry.get("x-button")

    expect(resolved).toBe(replacement)
  })
})
