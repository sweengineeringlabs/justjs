import { describe, it, expect } from "bun:test"
import { BootError, type BootConfig } from "../api/boot.js"
import { JustJS } from "../core/boot.js"
import type { DomAddressMap } from "../api/dom-address.js"

const DDAS = (tags: string[]): DomAddressMap => ({
  elements: Object.fromEntries(tags.map((t) => [`app:home:${t}:root`, { component: t, tag: t }])),
})

// Every aspect config now requires a `strategy` (ADR-0002 D3) — register a
// throwaway "test-strategy" for whichever concern a test declares so AC1
// (provider registration) passes and the test actually exercises the AC2/AC3
// behavior its name claims, rather than short-circuiting on a missing/
// unregistered strategy.
function registerTestStrategy(justjs: JustJS, ...concerns: string[]): void {
  justjs.clearProviders()
  for (const concern of concerns) {
    justjs.providers.register({ concern, strategy: "test-strategy", factory: () => ({ weave: () => {}, context: () => undefined }) })
  }
}

describe("Boot-time Validation — 4 ACs", () => {
  describe("AC 2: Routes exist in .on()/.except()", () => {
    it("test_boot_succeeds_with_valid_routes_and_registry", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard", "/account"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
          "x-account": { path: "/account", component: "Account" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard", "x-account"]),
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).resolves.toBeUndefined()
    })

    it("test_boot_fails_route_in_aspect_on_not_found", async () => {
      const justjs = JustJS.getInstance()
      registerTestStrategy(justjs, "security")

      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          security: {
            strategy: "test-strategy",
            routes: { on: ["/", "/admin"] }, // /admin not in routes
          },
        },
      }

      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect((error as BootError).code).toBe("ASPECT_ROUTE_NOT_FOUND")
      }
    })

    it("test_boot_fails_route_in_aspect_except_not_found", async () => {
      const justjs = JustJS.getInstance()
      registerTestStrategy(justjs, "observability")

      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          observability: {
            strategy: "test-strategy",
            routes: { except: ["/health", "/metrics"] }, // Not in routes
          },
        },
      }

      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect((error as BootError).code).toBe("ASPECT_ROUTE_NOT_FOUND")
      }
    })

    it("test_boot_suggests_nearest_route_on_typo", async () => {
      const justjs = JustJS.getInstance()
      registerTestStrategy(justjs, "security")

      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          security: {
            strategy: "test-strategy",
            routes: { on: ["/dashbord"] }, // typo
          },
        },
      }

      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect((error as BootError).nearest).toBe("/dashboard")
      }
    })
  })

  describe("AC 3: Components exist in .on()/.except()", () => {
    it("test_boot_fails_component_in_aspect_on_not_found", async () => {
      const justjs = JustJS.getInstance()
      registerTestStrategy(justjs, "security")

      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          security: {
            strategy: "test-strategy",
            components: { on: ["x-root", "x-admin"] }, // x-admin not registered
          },
        },
      }

      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect((error as BootError).code).toBe("ASPECT_COMPONENT_NOT_FOUND")
      }
    })

    it("test_boot_fails_component_in_aspect_except_not_found", async () => {
      const justjs = JustJS.getInstance()
      registerTestStrategy(justjs, "observability")

      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          observability: {
            strategy: "test-strategy",
            components: { except: ["x-internal", "x-debug"] }, // Not registered
          },
        },
      }

      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect((error as BootError).code).toBe("ASPECT_COMPONENT_NOT_FOUND")
      }
    })

    it("test_boot_suggests_nearest_component_on_typo", async () => {
      const justjs = JustJS.getInstance()
      registerTestStrategy(justjs, "security")

      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          security: {
            strategy: "test-strategy",
            components: { on: ["x-dashbord"] }, // typo
          },
        },
      }

      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect((error as BootError).nearest).toBe("x-dashboard")
      }
    })
  })

  describe("AC 4: DDAS entries exist for all components", () => {
    it("test_boot_succeeds_with_valid_ddas", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: {
          elements: {
            "app:home:x-root:main": { component: "root", tag: "x-root" },
            "app:home:x-root:role-main": { component: "root", tag: "x-root" },
            "app:home:x-dashboard:root": { component: "dashboard", tag: "x-dashboard" },
            "app:home:x-dashboard:view": { component: "dashboard", tag: "x-dashboard" },
          },
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).resolves.toBeUndefined()
    })

    it("test_boot_fails_missing_ddas_entry", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: {
          elements: {
            "app:home:x-root:main": { component: "root", tag: "x-root" },
            // x-dashboard missing
          },
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_without_ddas_when_components_registered", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        // domAddressMap omitted - now required when components exist
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_rejects_domaddressmap_missing_elements_with_a_clear_error", async () => {
      // Legacy pre-migration shape (flat Record<tag, string[]>), no
      // `elements` property - must fail with an actionable BootError, not a
      // raw "Object.values requires..." TypeError.
      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: { "x-root": ["main"] } as unknown as DomAddressMap,
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(/elements/)
    })

    it("test_boot_rejects_a_domaddressmap_with_no_tag_field_on_any_element", async () => {
      // Every element present but none carry `tag` - the signature of
      // output generated before justweb#56. Must fail with a distinct,
      // actionable message pointing at the real cause (a stale generator),
      // not the generic per-tag "missing DDAS entry" message.
      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: { elements: { "app:home:x-root:root": { component: "root" } } },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(/justweb#56/)
    })
  })

  describe("AC 1: Providers registered in JustJS.providers", () => {
    it("test_boot_succeeds_with_registered_providers", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()
      justjs.providers.register({ concern: "security", strategy: "oauth", factory: () => ({ weave: () => {}, context: () => undefined }) })
      justjs.providers.register({ concern: "observability", strategy: "datadog", factory: () => ({ weave: () => {}, context: () => undefined }) })

      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          security: { strategy: "oauth" },
          observability: { strategy: "datadog" },
        },
      }

      await expect(justjs.boot(config)).resolves.toBeUndefined()
    })

    it("test_boot_fails_unregistered_provider", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()
      justjs.providers.register({ concern: "security", strategy: "oauth", factory: () => ({}) })
      // datadog not registered

      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        aspects: {
          security: { strategy: "oauth" },
          observability: { strategy: "datadog" }, // Not registered
        },
      }

      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_suggests_nearest_provider_on_typo", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()
      justjs.providers.register({ concern: "security", strategy: "oauth", factory: () => ({}) })
      justjs.providers.register({ concern: "observability", strategy: "datadog", factory: () => ({}) })

      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          security: { strategy: "oaauth" }, // typo
        },
      }

      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect((error as BootError).nearest).toBe("oauth")
      }
    })
  })

  describe("Combined AC validation", () => {
    it("test_boot_all_4_acs_pass_together", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()
      justjs.providers.register({ concern: "security", strategy: "oauth", factory: () => ({ weave: () => {}, context: () => undefined }) })
      justjs.providers.register({ concern: "observability", strategy: "datadog", factory: () => ({ weave: () => {}, context: () => undefined }) })

      const config: BootConfig = {
        routes: ["/", "/dashboard", "/account"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
          "x-account": { path: "/account", component: "Account" },
        },
        domAddressMap: {
          elements: {
            "app:home:x-root:main": { component: "root", tag: "x-root" },
            "app:home:x-dashboard:root": { component: "dashboard", tag: "x-dashboard" },
            "app:home:x-account:root": { component: "account", tag: "x-account" },
          },
        },
        aspects: {
          security: { strategy: "oauth" },
          observability: { strategy: "datadog" },
        },
      }

      await expect(justjs.boot(config)).resolves.toBeUndefined()
    })

    it("test_boot_with_complex_aspect_routing", async () => {
      const justjs = JustJS.getInstance()
      registerTestStrategy(justjs, "security", "observability")

      const config: BootConfig = {
        routes: ["/", "/public", "/admin", "/admin/users"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-public": { path: "/public", component: "Public" },
          "x-admin": { path: "/admin", component: "Admin" },
          "x-users": { path: "/admin/users", component: "Users" },
        },
        domAddressMap: {
          elements: {
            "app:home:x-root:main": { component: "root", tag: "x-root" },
            "app:home:x-public:root": { component: "public", tag: "x-public" },
            "app:home:x-admin:root": { component: "admin", tag: "x-admin" },
            "app:home:x-users:root": { component: "users", tag: "x-users" },
          },
        },
        aspects: {
          security: {
            strategy: "test-strategy",
            routes: { on: ["/admin", "/admin/users"] },
            components: { on: ["x-admin", "x-users"] },
          },
          observability: {
            strategy: "test-strategy",
            routes: { except: ["/public"] },
            components: { except: ["x-public"] },
          },
        },
      }

      await expect(justjs.boot(config)).resolves.toBeUndefined()
    })
  })

  describe("Error messages", () => {
    it("test_boot_error_includes_all_context", async () => {
      const justjs = JustJS.getInstance()
      registerTestStrategy(justjs, "security")

      const config: BootConfig = {
        routes: ["/home", "/checkout", "/dashboard"],
        registry: {
          "x-home": { path: "/home", component: "Home" },
          "x-checkout": { path: "/checkout", component: "Checkout" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-home", "x-checkout", "x-dashboard"]),
        aspects: {
          security: {
            strategy: "test-strategy",
            routes: { on: ["/cheackout"] }, // typo
          },
        },
      }

      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown")
      } catch (error) {
        const e = error as BootError
        expect(e.code).toBe("ASPECT_ROUTE_NOT_FOUND")
        expect(e.received).toBe("/cheackout")
        expect(e.known).toContain("/checkout")
        expect(e.nearest).toBe("/checkout")
        expect(e.message).toContain("cheackout")
      }
    })
  })

  describe("boot() resolves and weaves declared aspects", () => {
    it("test_boot_calls_weave_on_every_declared_aspect_after_validation_passes", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      const wovenTargets: unknown[] = []
      justjs.providers.register({
        concern: "security",
        strategy: "recording",
        factory: () => ({
          concern: "security",
          strategy: "recording",
          weave: (target: unknown) => wovenTargets.push(target),
          context: () => undefined,
        }),
      })

      const config: BootConfig = {
        routes: ["/", "/admin"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-admin": { path: "/admin", component: "Admin" },
        },
        domAddressMap: DDAS(["x-root", "x-admin"]),
        aspects: {
          security: {
            strategy: "recording",
            routes: { on: ["/admin"] },
            components: { on: ["x-admin"] },
          },
        },
      }

      await justjs.boot(config)

      expect(wovenTargets).toHaveLength(1)
      expect(wovenTargets[0]).toEqual({
        concern: "security",
        routes: ["/admin"],
        components: ["x-admin"],
      })
    })

    it("test_boot_never_calls_weave_when_no_aspects_declared", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      let weaveCalled = false
      justjs.providers.register({
        concern: "security",
        strategy: "recording",
        factory: () => ({
          concern: "security",
          strategy: "recording",
          weave: () => {
            weaveCalled = true
          },
          context: () => undefined,
        }),
      })

      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
      }

      await justjs.boot(config)

      expect(weaveCalled).toBe(false)
    })
  })
})
