import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { createHash } from "node:crypto"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createFeatureStore, createUIEventBus } from "@justjs/data"
import { configureTransportProxy } from "@justjs/network"
import { BootError, type BootConfig } from "../api/boot.js"
import type { ErrorBoundary } from "../api/error_boundary.js"
import { JustJS } from "../core/boot.js"
import type { DomAddressMap } from "../api/dom-address.js"
import type { Component } from "../api/component.js"
import { DefaultComponentRegistry } from "../core/registry/component_registry.js"

const DDAS = (tags: string[]): DomAddressMap => ({
  elements: Object.fromEntries(tags.map((t) => [`app:home:${t}:root`, { component: t, tag: t }])),
})

const TEST_JUSTWEB_CONTRACT = {
  generatorVersion: "0.1.0" as const,
  generatorRevision: "64eb51bf4d471261053f6d08dac6db5ce613abd8",
  artifactSchema: 1 as const,
}

function bootWithGeneratedFixture(justjs: JustJS, config: Partial<BootConfig>): Promise<void> {
  const map = config.domAddressMap ?? { elements: {} }
  const artifacts = [
    { path: "public/dom-address-map.json", sha256: createHash("sha256").update(JSON.stringify(map, null, 2)).digest("hex") },
    { path: "src/registry.gen.ts", sha256: "0".repeat(64) },
    { path: "src/component-registry.gen.ts", sha256: "0".repeat(64) },
  ]
  if ((config.routes?.length ?? 0) > 0) {
    artifacts.push(
      { path: "public/routes.gen.json", sha256: "0".repeat(64) },
      { path: "src/routes.gen.ts", sha256: "0".repeat(64) },
    )
  }
  return justjs.boot({
    ...config,
    justwebContract: config.justwebContract ?? TEST_JUSTWEB_CONTRACT,
    justwebManifest: config.justwebManifest ?? {
      format: "justweb-artifact-manifest",
      formatVersion: 1,
      generator: { name: "justw", version: "0.1.0", revision: TEST_JUSTWEB_CONTRACT.generatorRevision, sourceDirty: false },
      artifacts,
    },
  } as BootConfig)
}

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
      await expect(bootWithGeneratedFixture(justjs, config)).resolves.toBeUndefined()
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
        await bootWithGeneratedFixture(justjs, config)
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
        await bootWithGeneratedFixture(justjs, config)
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
        await bootWithGeneratedFixture(justjs, config)
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
        await bootWithGeneratedFixture(justjs, config)
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
        await bootWithGeneratedFixture(justjs, config)
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
        await bootWithGeneratedFixture(justjs, config)
        expect.unreachable("Should have thrown")
      } catch (error) {
        expect((error as BootError).nearest).toBe("x-dashboard")
      }
    })
  })

  describe("AC 4: DDAS entries exist for all components", () => {
    it("validates component addresses before creating aspects", async () => {
      const justjs = JustJS.getInstance()
      let created = false
      justjs.providers.register({
        concern: "address-validation", strategy: "test",
        factory: () => { created = true; return { weave() {} } },
      })
      await expect(bootWithGeneratedFixture(justjs, {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-other"]),
        aspects: { "address-validation": { strategy: "test" } },
      })).rejects.toMatchObject({ code: "MISSING_DDAS_ENTRY" })
      expect(created).toBe(false)
    })
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
      await expect(bootWithGeneratedFixture(justjs, config)).resolves.toBeUndefined()
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
      await expect(bootWithGeneratedFixture(justjs, config)).rejects.toThrow(BootError)
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
      await expect(bootWithGeneratedFixture(justjs, config)).rejects.toThrow(BootError)
    })

    it("test_boot_rejects_domaddressmap_missing_elements_with_a_clear_error", async () => {
      // Invalid flat map shape (Record<tag, string[]>), no `elements`
      // property - must fail with an actionable BootError, not a
      // raw "Object.values requires..." TypeError.
      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: { "x-root": ["main"] } as unknown as DomAddressMap,
      }

      const justjs = JustJS.getInstance()
      await expect(bootWithGeneratedFixture(justjs, config)).rejects.toThrow(/elements/)
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
      await expect(bootWithGeneratedFixture(justjs, config)).rejects.toMatchObject({ code: "MISSING_DDAS_ENTRY" })
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

      await expect(bootWithGeneratedFixture(justjs, config)).resolves.toBeUndefined()
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

      await expect(bootWithGeneratedFixture(justjs, config)).rejects.toThrow(BootError)
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
        await bootWithGeneratedFixture(justjs, config)
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

      await expect(bootWithGeneratedFixture(justjs, config)).resolves.toBeUndefined()
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

      await expect(bootWithGeneratedFixture(justjs, config)).resolves.toBeUndefined()
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
        await bootWithGeneratedFixture(justjs, config)
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

      await bootWithGeneratedFixture(justjs, config)

      expect(wovenTargets).toHaveLength(1)
      expect(wovenTargets[0]).toEqual({
        concern: "security",
        routes: ["/admin"],
        components: ["x-admin"],
      })
    })

    it("test_boot_passes_declared_aspect_config_to_the_strategy_factory", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      const receivedConfigs: unknown[] = []
      justjs.providers.register({
        concern: "aiAssist",
        strategy: "anthropic",
        factory: (config?: unknown) => {
          receivedConfigs.push(config)
          return {
            concern: "aiAssist",
            strategy: "anthropic",
            weave: () => {},
            context: () => undefined,
          }
        },
      })

      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
        aspects: {
          aiAssist: { strategy: "anthropic", config: { apiKey: "sk-ant-test" } },
        },
      }

      await bootWithGeneratedFixture(justjs, config)

      expect(receivedConfigs).toHaveLength(1)
      expect(receivedConfigs[0]).toEqual({ apiKey: "sk-ant-test" })
    })

    it("test_boot_calls_strategy_factory_with_undefined_when_no_config_declared", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      const receivedConfigs: unknown[] = []
      justjs.providers.register({
        concern: "security",
        strategy: "recording",
        factory: (config?: unknown) => {
          receivedConfigs.push(config)
          return {
            concern: "security",
            strategy: "recording",
            weave: () => {},
            context: () => undefined,
          }
        },
      })

      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
        aspects: {
          security: { strategy: "recording" },
        },
      }

      await bootWithGeneratedFixture(justjs, config)

      expect(receivedConfigs).toHaveLength(1)
      expect(receivedConfigs[0]).toBeUndefined()
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

      await bootWithGeneratedFixture(justjs, config)

      expect(weaveCalled).toBe(false)
    })
  })

  describe("boot() is a real composition root (ADR-0002 D4)", () => {
    class FakeCustomElement {
      readonly attributes: Record<string, string> = {}
      setAttribute(name: string, value: string): void {
        this.attributes[name] = value
      }
      removeAttribute(name: string): void {
        delete this.attributes[name]
      }
    }

    it("test_boot_builds_a_real_component_registry_from_a_lazy_map", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-widget": { path: "/", component: "Widget" } },
        domAddressMap: DDAS(["x-widget"]),
        componentRegistry: {
          "x-widget": () => Promise.resolve(FakeCustomElement as unknown as CustomElementConstructor),
        },
      }

      await bootWithGeneratedFixture(justjs, config)

      expect(justjs.componentRegistry).toBeDefined()
      const component = await justjs.componentRegistry!.get("x-widget")
      expect(component.name).toBe("x-widget")
    })

    it("test_boot_leaves_component_registry_undefined_when_none_supplied", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
      }
      await bootWithGeneratedFixture(justjs, config)

      expect(justjs.componentRegistry).toBeUndefined()
    })

    it("test_boot_always_builds_a_real_lifecycle_and_router", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
      }
      await bootWithGeneratedFixture(justjs, config)

      expect(justjs.lifecycle).toBeDefined()
      expect(typeof justjs.lifecycle!.run).toBe("function")
      expect(justjs.router).toBeDefined()
      expect(typeof justjs.router!.navigate).toBe("function")
    })

    it("test_boot_defaults_api_adapter_to_a_real_working_default", async () => {
      const server = Bun.serve({
        port: 0,
        async fetch(req) {
          if (req.url.endsWith("/proxy")) {
            const proxyRequest = await req.json() as { url: string; method?: string; headers?: Record<string, string>; body?: string }
            const proxied = await fetch(proxyRequest.url, {
              ...(proxyRequest.method ? { method: proxyRequest.method } : {}),
              ...(proxyRequest.headers ? { headers: proxyRequest.headers } : {}),
              ...(proxyRequest.body ? { body: proxyRequest.body } : {}),
            })
            return Response.json({
              status: proxied.status,
              statusText: proxied.statusText,
              headers: Object.fromEntries(proxied.headers.entries()),
              body: await proxied.text(),
              ok: proxied.ok,
            })
          }
          if (req.url.includes("/ping")) {
            return new Response(JSON.stringify({ pong: true }), {
              headers: { "content-type": "application/json" },
            })
          }
          return new Response("Not found", { status: 404 })
        },
      })

      try {
        configureTransportProxy(`http://localhost:${server.port}/proxy`)
        const justjs = JustJS.getInstance()
        justjs.clearProviders()

        const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
      }
        await bootWithGeneratedFixture(justjs, config)

        expect(justjs.apiAdapter).toBeDefined()
        const result = await justjs.apiAdapter!.get<{ pong: boolean }>(`http://localhost:${server.port}/ping`)
        expect(result.data.pong).toBe(true)
      } finally {
        server.stop()
      }
    })

    it("test_boot_uses_a_caller_supplied_api_adapter_instead_of_the_default", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      const customApiAdapter = {
        get: async () => ({ status: 200, data: "custom", headers: {} }),
        post: async () => ({ status: 200, data: "custom", headers: {} }),
        put: async () => ({ status: 200, data: "custom", headers: {} }),
        delete: async () => ({ status: 200, data: "custom", headers: {} }),
      }

      const config: BootConfig = {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
        apiAdapter: customApiAdapter,
      }
      await bootWithGeneratedFixture(justjs, config)

      expect(justjs.apiAdapter).toBe(customApiAdapter)
    })
  })

  describe("boot() threads a shared FeatureStore/UIEventBus end-to-end (ADR-0003 D8)", () => {
    beforeAll(() => {
      GlobalRegistrator.register()
    })

    afterAll(async () => {
      await GlobalRegistrator.unregister()
    })

    it("test_a_real_navigate_call_reaches_a_component_that_reads_and_dispatches_against_a_shared_store", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      const store = createFeatureStore<{ count: number }, { type: "INCREMENT" }>(
        { count: 0 },
        (state, action) => (action.type === "INCREMENT" ? { count: state.count + 1 } : state)
      )
      const eventBus = createUIEventBus()
      const eventsReceived: unknown[] = []
      eventBus.on("mounted", (data) => eventsReceived.push(data))

      const rendered: { count: number | undefined }[] = []
      const component: Component = {
        name: "counter",
        render(_props, _element, ctx) {
          ctx?.store?.dispatch({ type: "INCREMENT" })
          rendered.push({ count: (ctx?.store as typeof store | undefined)?.state.value.count })
          ctx?.eventBus?.emit("mounted", { tag: "x-counter" })
        },
      }

      const registry = new DefaultComponentRegistry()
      registry.register("x-counter", () => component)

      const target = document.createElement("x-counter")
      target.setAttribute("data-ddas-id", "app:home:x-counter:root")
      document.body.appendChild(target)

      const config: BootConfig = {
        routes: ["/counter"],
        registry: { "x-counter": { path: "/counter", component: "Counter" } },
        domAddressMap: DDAS(["x-counter"]),
        componentRegistry: registry,
        featureStore: store,
        eventBus,
      }

      await bootWithGeneratedFixture(justjs, config)
      await justjs.router!.navigate("/counter")

      expect(rendered).toEqual([{ count: 1 }])
      expect(store.state.value.count).toBe(1)
      expect(eventsReceived).toEqual([{ tag: "x-counter" }])
    })
  })

  describe("boot() threads an ErrorBoundary through to a real navigate() call", () => {
    beforeAll(() => {
      GlobalRegistrator.register()
    })

    afterAll(async () => {
      await GlobalRegistrator.unregister()
    })

    it("test_a_real_navigate_call_survives_a_component_error_when_an_error_boundary_is_configured", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()

      const component: Component = {
        name: "dashboard",
        render() {
          throw new Error("dashboard render boom")
        },
      }
      const registry = new DefaultComponentRegistry()
      registry.register("x-dashboard", () => component)

      const target = document.createElement("x-dashboard")
      target.setAttribute("data-ddas-id", "app:home:x-dashboard:root")
      document.body.appendChild(target)

      const caught: unknown[] = []
      const errorBoundary: ErrorBoundary = {
        onError(error) {
          caught.push(error)
        },
      }

      const config: BootConfig = {
        routes: ["/dashboard"],
        registry: { "x-dashboard": { path: "/dashboard", component: "Dashboard" } },
        domAddressMap: DDAS(["x-dashboard"]),
        componentRegistry: registry,
        errorBoundary,
      }

      await bootWithGeneratedFixture(justjs, config)

      // Without the boundary this would reject and fail the test - proves
      // the failure is genuinely contained, not just theoretically possible.
      await expect(justjs.router!.navigate("/dashboard")).resolves.toBeUndefined()
      expect(caught).toHaveLength(1)
      expect((caught[0] as Error).message).toBe("dashboard render boom")
    })

    it("requires the app pin to match the generated manifest exactly", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()
      await expect(bootWithGeneratedFixture(justjs, {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
        justwebContract: { ...TEST_JUSTWEB_CONTRACT, generatorRevision: "b".repeat(40) },
      })).rejects.toMatchObject({ code: "INVALID_JUSTWEB_MANIFEST" })
    })

    it("rejects artifacts generated from a modified JustWeb checkout", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()
      const manifest = {
        format: "justweb-artifact-manifest" as const,
        formatVersion: 1 as const,
        generator: { name: "justw" as const, version: "0.1.0", revision: TEST_JUSTWEB_CONTRACT.generatorRevision, sourceDirty: true },
        artifacts: [
          { path: "public/dom-address-map.json", sha256: createHash("sha256").update(JSON.stringify(DDAS(["x-root"]), null, 2)).digest("hex") },
          { path: "src/registry.gen.ts", sha256: "0".repeat(64) },
          { path: "src/component-registry.gen.ts", sha256: "0".repeat(64) },
          { path: "public/routes.gen.json", sha256: "0".repeat(64) },
          { path: "src/routes.gen.ts", sha256: "0".repeat(64) },
        ],
      }
      await expect(bootWithGeneratedFixture(justjs, {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
        justwebManifest: manifest,
      })).rejects.toMatchObject({ code: "INVALID_JUSTWEB_MANIFEST" })
    })

    it("turns malformed contract metadata into an actionable BootError", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()
      await expect(bootWithGeneratedFixture(justjs, {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
        justwebManifest: {} as BootConfig["justwebManifest"],
      })).rejects.toMatchObject({ code: "INVALID_JUSTWEB_MANIFEST" })
    })

    it("clears an existing runtime when a reconfiguration fails contract validation", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()
      await bootWithGeneratedFixture(justjs, {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
        apiAdapter: { fetch: async () => ({}) } as any,
      })
      expect(justjs.router).toBeDefined()

      await expect(bootWithGeneratedFixture(justjs, {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
        justwebManifest: {} as BootConfig["justwebManifest"],
      })).rejects.toMatchObject({ code: "INVALID_JUSTWEB_MANIFEST" })
      expect(justjs.router).toBeUndefined()
      expect(justjs.lifecycle).toBeUndefined()
      expect(justjs.componentRegistry).toBeUndefined()
    })

    it("rejects post-boot registration of a tag outside the JustWeb contract", async () => {
      const justjs = JustJS.getInstance()
      justjs.clearProviders()
      const registry = new DefaultComponentRegistry()
      registry.register("x-root", () => ({ name: "root", render() {} }))
      await bootWithGeneratedFixture(justjs, {
        routes: ["/"],
        registry: { "x-root": { path: "/", component: "Root" } },
        domAddressMap: DDAS(["x-root"]),
        componentRegistry: registry,
        apiAdapter: { fetch: async () => ({}) } as any,
      })
      expect(() => (justjs.componentRegistry as any).register("x-forged", () => ({ name: "forged", render() {} })))
        .toThrow(/not declared by the JustWeb dom-address-map/)
      expect(() => registry.register("x-root", () => ({ name: "replacement", render() {} })))
        .toThrow(/sealed after JustWeb contract validation/)
    })
  })
})
