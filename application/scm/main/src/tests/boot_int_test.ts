import { describe, it, expect } from "bun:test"
import { BootError, type BootConfig } from "../api/api_boot.js"
import { JustJS } from "../core/boot.js"

const DDAS = (tags: string[]): Record<string, readonly string[]> => {
  const m: Record<string, readonly string[]> = {}
  tags.forEach(t => { m[t] = [t] })
  return m
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
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        aspects: {
          security: {
            routes: { on: ["/", "/admin"] }, // /admin not in routes
          },
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_route_in_aspect_except_not_found", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        aspects: {
          observability: {
            routes: { except: ["/health", "/metrics"] }, // Not in routes
          },
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_suggests_nearest_route_on_typo", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          security: {
            routes: { on: ["/dashbord"] }, // typo
          },
        },
      }

      const justjs = JustJS.getInstance()
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
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        aspects: {
          security: {
            components: { on: ["x-root", "x-admin"] }, // x-admin not registered
          },
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_component_in_aspect_except_not_found", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        aspects: {
          observability: {
            components: { except: ["x-internal", "x-debug"] }, // Not registered
          },
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_suggests_nearest_component_on_typo", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
        domAddressMap: DDAS(["x-root", "x-dashboard"]),
        aspects: {
          security: {
            components: { on: ["x-dashbord"] }, // typo
          },
        },
      }

      const justjs = JustJS.getInstance()
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
          "x-root": ["main", "[role=main]"],
          "x-dashboard": ["div.dashboard", ".dashboard-view"],
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
          "x-root": ["main"],
          // x-dashboard missing
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
  })

  describe("AC 1: Providers registered in JustJS.providers", () => {
    it("test_boot_succeeds_with_registered_providers", async () => {
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
          security: "oauth",
          observability: "datadog", // Not registered
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
          security: "oaauth", // typo
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
      justjs.providers.register({ concern: "security", strategy: "oauth", factory: () => ({}) })
      justjs.providers.register({ concern: "observability", strategy: "datadog", factory: () => ({}) })

      const config: BootConfig = {
        routes: ["/", "/dashboard", "/account"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
          "x-account": { path: "/account", component: "Account" },
        },
        domAddressMap: {
          "x-root": ["main"],
          "x-dashboard": ["div.dashboard"],
          "x-account": ["div.account"],
        },
        aspects: {
          security: { strategy: "oauth" },
          observability: { strategy: "datadog" },
        },
      }

      await expect(justjs.boot(config)).resolves.toBeUndefined()
    })

    it("test_boot_with_complex_aspect_routing", async () => {
      const config: BootConfig = {
        routes: ["/", "/public", "/admin", "/admin/users"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-public": { path: "/public", component: "Public" },
          "x-admin": { path: "/admin", component: "Admin" },
          "x-users": { path: "/admin/users", component: "Users" },
        },
        domAddressMap: {
          "x-root": ["main"],
          "x-public": ["div.public"],
          "x-admin": ["div.admin"],
          "x-users": ["div.users"],
        },
        aspects: {
          security: {
            routes: { on: ["/admin", "/admin/users"] },
            components: { on: ["x-admin", "x-users"] },
          },
          observability: {
            routes: { except: ["/public"] },
            components: { except: ["x-public"] },
          },
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).resolves.toBeUndefined()
    })
  })

  describe("Error messages", () => {
    it("test_boot_error_includes_all_context", async () => {
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
            routes: { on: ["/cheackout"] }, // typo
          },
        },
      }

      const justjs = JustJS.getInstance()
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
})
