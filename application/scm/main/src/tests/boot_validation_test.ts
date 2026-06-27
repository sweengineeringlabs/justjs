import { describe, it, expect } from "bun:test"
import { BootError, type BootConfig } from "../api/boot.js"
import { JustJS } from "../core/boot.js"

describe("Boot-time Validation", () => {
  describe("Valid configurations", () => {
    it("test_boot_succeeds_with_valid_routes_and_registry", async () => {
      const validConfig: BootConfig = {
        routes: ["/", "/dashboard", "/account"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
          "x-account": { path: "/account", component: "Account" },
        },
      }

      const justjs = JustJS.getInstance()
      // Should not throw
      await expect(justjs.boot(validConfig)).resolves.toBeUndefined()
    })
  })

  describe("Missing configuration", () => {
    it("test_boot_fails_missing_routes", async () => {
      const config: BootConfig = {
        registry: { "x-test": { path: "/", component: "Test" } },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_missing_registry", async () => {
      const config: BootConfig = {
        routes: ["/"],
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })
  })

  describe("Invalid route format", () => {
    it("test_boot_fails_route_not_string", async () => {
      const config: BootConfig = {
        routes: ["/", 123] as any,
        registry: { "x-root": { path: "/", component: "Root" } },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_duplicate_routes", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_route_without_leading_slash", async () => {
      const config: BootConfig = {
        routes: ["/", "dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })
  })

  describe("Invalid registry format", () => {
    it("test_boot_fails_registry_entry_missing_path", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { component: "Dashboard" } as any,
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_registry_entry_missing_component", async () => {
      const config: BootConfig = {
        routes: ["/"],
        registry: {
          "x-root": { path: "/" } as any,
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_duplicate_component_tags", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-shared": { path: "/", component: "SharedComponent" },
          "x-shared": { path: "/dashboard", component: "DifferentComponent" },
        } as any,
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })
  })

  describe("Route-Registry mapping validation", () => {
    it("test_boot_fails_route_without_registry_entry", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard", "/admin"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
          // Missing /admin
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_registry_entry_without_route", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
          "x-admin": { path: "/admin", component: "Admin" }, // Not in routes
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })

    it("test_boot_fails_path_mismatch_between_route_and_registry", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashboard"],
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/different-path", component: "Dashboard" }, // Mismatch
        },
      }

      const justjs = JustJS.getInstance()
      await expect(justjs.boot(config)).rejects.toThrow(BootError)
    })
  })

  describe("BootError details", () => {
    it("test_boot_error_includes_code_and_context", async () => {
      const config: BootConfig = {
        routes: ["/"],
      }

      const justjs = JustJS.getInstance()
      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown BootError")
      } catch (error) {
        expect(error).toBeInstanceOf(BootError)
        expect((error as BootError).code).toBeTruthy()
        expect((error as BootError).message).toContain("Boot failed")
      }
    })

    it("test_boot_error_suggests_nearest_match_on_typo", async () => {
      const config: BootConfig = {
        routes: ["/", "/dashbord"], // Typo: dashbord instead of dashboard
        registry: {
          "x-root": { path: "/", component: "Root" },
          "x-dashboard": { path: "/dashboard", component: "Dashboard" },
        },
      }

      const justjs = JustJS.getInstance()
      try {
        await justjs.boot(config)
        expect.unreachable("Should have thrown BootError")
      } catch (error) {
        // Should suggest /dashboard as nearest match
        expect((error as BootError).nearest).toBeDefined()
      }
    })
  })

  describe("Boot idempotency", () => {
    it("test_boot_validates_on_each_call", async () => {
      const validConfig: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
      }

      const justjs = JustJS.getInstance()

      // First boot succeeds
      await expect(justjs.boot(validConfig)).resolves.toBeUndefined()

      // Second boot with same config should also succeed
      await expect(justjs.boot(validConfig)).resolves.toBeUndefined()

      // Boot with invalid config should fail
      const invalidConfig: BootConfig = { routes: ["/"] }
      await expect(justjs.boot(invalidConfig)).rejects.toThrow(BootError)
    })
  })
})
