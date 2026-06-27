import { describe, it, expect } from "bun:test"
import { validateBootConfig } from "../core/boot_validator.js"
import type { BootConfig } from "../api/boot.js"

const routes = { version: 1, routes: [{ path: "/home", componentId: "c1", featureId: "f1" }, { path: "/checkout", componentId: "c2", featureId: "f2" }] }
const registry = { components: [{ id: "c1", tagName: "js-home" }, { id: "c2", tagName: "js-checkout" }] }
const importmap = { version: 1, imports: {} }
const domMap = { app: "myapp", version: "1", schema: "1", elements: { "myapp:home:js-home:root": { id: "myapp:home:js-home:root", component: "js-home", feature: "home", element: "root" }, "myapp:checkout:js-checkout:root": { id: "myapp:checkout:js-checkout:root", component: "js-checkout", feature: "checkout", element: "root" } } }

function strategies(map: Record<string, string[]> = {}): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const [concern, names] of Object.entries(map)) out.set(concern, new Set(names))
  return out
}

const validConfig: BootConfig = { routes, importmap, registry, domMap }

describe("validateBootConfig", () => {
  it("test_validate_clean_config_returns_no_errors", () => {
    const errors = validateBootConfig(validConfig, strategies())
    expect(errors).toHaveLength(0)
  })

  it("test_boot_unknown_strategy_throws_before_layers_start", () => {
    const config: BootConfig = { ...validConfig, security: { strategy: "oauth", on: ["/home"] } }
    const errors = validateBootConfig(config, strategies())
    expect(errors).toHaveLength(1)
    expect(errors[0]!.code).toBe("UNKNOWN_STRATEGY")
    expect(errors[0]!.received).toBe("oauth")
  })

  it("test_registered_strategy_passes_validation", () => {
    const config: BootConfig = { ...validConfig, security: { strategy: "oauth", on: ["/home"] } }
    const errors = validateBootConfig(config, strategies({ security: ["oauth"] }))
    expect(errors).toHaveLength(0)
  })

  it("test_boot_unknown_route_throws_before_layers_start", () => {
    const config: BootConfig = { ...validConfig, security: { strategy: "oauth", on: ["/cheackout"] } }
    const errors = validateBootConfig(config, strategies({ security: ["oauth"] }))
    expect(errors.some(e => e.code === "UNKNOWN_ROUTE")).toBe(true)
    expect(errors.find(e => e.code === "UNKNOWN_ROUTE")!.received).toBe("/cheackout")
  })

  it("test_boot_error_message_includes_nearest_match", () => {
    const config: BootConfig = { ...validConfig, security: { strategy: "oauth", on: ["/cheackout"] } }
    const errors = validateBootConfig(config, strategies({ security: ["oauth"] }))
    const routeError = errors.find(e => e.code === "UNKNOWN_ROUTE")!
    expect(routeError.nearest).toBe("/checkout")
    expect(routeError.message).toContain("Did you mean")
  })

  it("test_boot_unknown_component_returns_error", () => {
    const config: BootConfig = { ...validConfig, observability: { strategy: "dd", on: ["js-chekout"] } }
    const errors = validateBootConfig(config, strategies({ observability: ["dd"] }))
    expect(errors.some(e => e.code === "UNKNOWN_COMPONENT")).toBe(true)
  })

  it("test_boot_invalid_ddas_address_throws_before_layers_start", () => {
    const config: BootConfig = { ...validConfig, observability: { strategy: "dd", on: ["js-home"] } }
    const noDdas = { ...domMap, elements: {} }
    const errors = validateBootConfig({ ...config, domMap: noDdas }, strategies({ observability: ["dd"] }))
    expect(errors.some(e => e.code === "INVALID_DDAS_ADDRESS")).toBe(true)
  })

  it("test_boot_valid_component_with_ddas_passes", () => {
    const config: BootConfig = { ...validConfig, observability: { strategy: "dd", on: ["js-home"] } }
    const errors = validateBootConfig(config, strategies({ observability: ["dd"] }))
    expect(errors.filter(e => e.code === "UNKNOWN_COMPONENT" || e.code === "INVALID_DDAS_ADDRESS")).toHaveLength(0)
  })
})
