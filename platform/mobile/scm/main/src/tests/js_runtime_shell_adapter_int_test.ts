import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import {
  createComponentRegistry,
  createLifecycle,
  createRouter,
  validateJustWebRuntimeMetadata,
} from "@justjs/application"
import type { DomAddressMap, RouteRegistryEntry } from "@justjs/application"
import { SUPPORTED_JUSTWEB_GENERATOR_REVISION } from "@justjs/application"
import { JsRuntimeShellAdapter } from "../core/js_runtime_shell_adapter.js"

async function validatedContract(domAddressMap: DomAddressMap) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(domAddressMap, null, 2)))
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return validateJustWebRuntimeMetadata({
    contract: { generatorVersion: "0.1.0", generatorRevision: SUPPORTED_JUSTWEB_GENERATOR_REVISION, artifactSchema: 1 },
    manifest: {
      format: "justweb-artifact-manifest", formatVersion: 1,
      generator: { name: "justw", version: "0.1.0", revision: SUPPORTED_JUSTWEB_GENERATOR_REVISION, sourceDirty: false },
      artifacts: [
        { path: "public/dom-address-map.json", sha256 },
        { path: "src/registry.gen.ts", sha256: "0".repeat(64) },
        { path: "src/component-registry.gen.ts", sha256: "0".repeat(64) },
        { path: "public/routes.gen.json", sha256: "0".repeat(64) },
        { path: "src/routes.gen.ts", sha256: "0".repeat(64) },
      ],
    },
    domAddressMap,
    routes: ["/dashboard", "/settings"],
  })
}

describe("JsRuntimeShellAdapter", () => {
  it("test_mount_returns_a_handle_whose_unmount_does_not_throw", () => {
    const adapter = new JsRuntimeShellAdapter()
    const element = { tagName: "div" } as unknown as Element
    const handle = adapter.mount("app:home:x-widget:root", element)
    expect(() => handle.unmount()).not.toThrow()
  })

  it("test_unmount_is_callable_more_than_once_without_throwing", () => {
    const adapter = new JsRuntimeShellAdapter()
    const element = { tagName: "div" } as unknown as Element
    const handle = adapter.mount("app:home:x-widget:root", element)
    handle.unmount()
    expect(() => handle.unmount()).not.toThrow()
  })
})

// justjs#67: proves JsRuntimeShellAdapter is exercised by the real teardown
// trigger (DefaultRouter navigating to a different route calls
// Lifecycle.unmount(ctx), which calls the tracked MountHandle.unmount()) -
// not just unit-tested in isolation. Wraps the real adapter to count calls,
// since JsRuntimeShellAdapter's own mount()/unmount() have no side effect
// this test environment can observe directly (no real android-shell here).
describe("JsRuntimeShellAdapter driven by the real Lifecycle/Router (justjs#67)", () => {
  beforeAll(() => {
    GlobalRegistrator.register()
  })

  afterAll(async () => {
    await GlobalRegistrator.unregister()
  })

  it("test_navigating_to_a_different_route_calls_unmount_on_the_previous_routes_handle", async () => {
    const real = new JsRuntimeShellAdapter()
    let mountCount = 0
    let unmountCount = 0
    const countingAdapter = {
      mount(ddasId: string, element: Element) {
        mountCount++
        const handle = real.mount(ddasId, element)
        return {
          unmount() {
            unmountCount++
            handle.unmount()
          },
        }
      },
    }

    const domAddressMap: DomAddressMap = {
      elements: {
        "app:home:dashboard:root": { component: "dashboard", tag: "x-dashboard" },
        "app:home:settings:root": { component: "settings", tag: "x-settings" },
      },
    }
    const contract = await validatedContract(domAddressMap)
    const registry = createComponentRegistry(contract)
    registry.register("x-dashboard", () => ({ name: "dashboard", render() {} }))
    registry.register("x-settings", () => ({ name: "settings", render() {} }))
    const lifecycle = createLifecycle(contract, countingAdapter, registry)

    const dashboardTarget = document.createElement("x-dashboard")
    dashboardTarget.setAttribute("data-ddas-id", "app:home:dashboard:root")
    document.body.appendChild(dashboardTarget)
    const settingsTarget = document.createElement("x-settings")
    settingsTarget.setAttribute("data-ddas-id", "app:home:settings:root")
    document.body.appendChild(settingsTarget)

    const routes: Record<string, RouteRegistryEntry> = {
      "x-dashboard": { path: "/dashboard", component: "dashboard" },
      "x-settings": { path: "/settings", component: "settings" },
    }
    const router = createRouter(["/dashboard", "/settings"], routes, lifecycle, contract)

    await router.navigate("/dashboard")
    expect(mountCount).toBe(1)
    expect(unmountCount).toBe(0)

    await router.navigate("/settings")
    expect(mountCount).toBe(2)
    expect(unmountCount).toBe(1)

    document.body.innerHTML = ""
  })
})

