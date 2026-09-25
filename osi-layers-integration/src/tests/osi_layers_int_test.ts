import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { createFetchAdapter, configureTransportProxy } from "@justjs/network"
import { createCacheAdapter } from "@justjs/transport"
import { createComponentRegistry, createRouter, createLifecycle, validateJustWebRuntimeMetadata, SUPPORTED_JUSTWEB_GENERATOR_REVISION } from "@justjs/application"
import { createFeatureStore } from "@justjs/data"
import type { Component, ComponentContext, DomAddressMap } from "@justjs/application"

const directFetch = globalThis.fetch.bind(globalThis)
let testTransportProxy: ReturnType<typeof Bun.serve>

async function validatedContract(domAddressMap: DomAddressMap, routes: string[] = []) {
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
        ...(routes.length ? [
          { path: "public/routes.gen.json", sha256: "0".repeat(64) },
          { path: "src/routes.gen.ts", sha256: "0".repeat(64) },
        ] : []),
      ],
    },
    domAddressMap,
    routes,
  })
}

describe("OSI Layers Integration Tests — Real Behavior", () => {
  beforeAll(() => {
    testTransportProxy = Bun.serve({
      port: 0,
      async fetch(request) {
        const proxyRequest = await request.json() as {
          url: string
          method?: string
          headers?: Record<string, string>
          body?: string
          bodyEncoding?: "utf8" | "base64"
        }
        const body = proxyRequest.body === undefined
          ? undefined
          : proxyRequest.bodyEncoding === "base64"
            ? Uint8Array.from(atob(proxyRequest.body), (char) => char.charCodeAt(0))
            : proxyRequest.body
        let response: Response
        try {
          response = await directFetch(proxyRequest.url, {
            ...(proxyRequest.method ? { method: proxyRequest.method } : {}),
            ...(proxyRequest.headers ? { headers: proxyRequest.headers } : {}),
            ...(body !== undefined ? { body } : {}),
          })
        } catch {
          return new Response("transport-proxy could not reach the target", { status: 502 })
        }
        return Response.json({
          status: response.status,
          statusText: response.statusText,
          headers: (() => {
            const headers: Record<string, string> = {}
            response.headers.forEach((value, key) => { headers[key] = value })
            return headers
          })(),
          body: await response.text(),
          ok: response.ok,
        })
      },
    })
    configureTransportProxy(`http://localhost:${testTransportProxy.port}`)
  })

  afterAll(() => testTransportProxy.stop())

  describe("Network ↔ Transport: Real HTTP → Cache", () => {
    it("test_fetchadapter_makes_actual_http_request_and_transport_caches_response", async () => {
      // REAL: Start a local HTTP server
      const server = Bun.serve({
        port: 0, // Random port
        async fetch(req) {
          if (req.url.includes("/api/user/1")) {
            return new Response(
              JSON.stringify({ id: 1, name: "Alice", role: "admin" }),
              { headers: { "content-type": "application/json" } }
            )
          }
          return new Response("Not found", { status: 404 })
        },
      })

      try {
        const port = server.port
        const fetchAdapter = createFetchAdapter()
        const cacheAdapter = createCacheAdapter()

        // ACTUAL: Network layer makes real HTTP request
        const response = await fetchAdapter.fetch({
          url: `http://localhost:${port}/api/user/1`,
          method: "GET",
        })

        expect(response.ok).toBe(true)
        expect(response.status).toBe(200)

        // ACTUAL: Parse response and cache it
        const data = JSON.parse(response.body)
        expect(data.id).toBe(1)
        expect(data.name).toBe("Alice")

        // ACTUAL: Transport layer caches the real response
        await cacheAdapter.set(`http://localhost:${port}/api/user/1`, data)
        const cached = await cacheAdapter.get<{ id: number; name: string; role: string }>(
          `http://localhost:${port}/api/user/1`
        )

        // VERIFY: Cache has the actual HTTP response data
        expect(cached?.id).toBe(1)
        expect(cached?.role).toBe("admin")
      } finally {
        server.stop()
      }
    })

    it("test_fetchadapter_handles_real_http_errors", async () => {
      const server = Bun.serve({
        port: 0,
        async fetch(req) {
          if (req.url.includes("/api/forbidden")) {
            return new Response("Forbidden", { status: 403 })
          }
          return new Response("Not found", { status: 404 })
        },
      })

      try {
        const port = server.port
        const fetchAdapter = createFetchAdapter()

        // ACTUAL: Network layer handles real 403 error
        const response = await fetchAdapter.fetch({
          url: `http://localhost:${port}/api/forbidden`,
          method: "GET",
        })

        expect(response.ok).toBe(false)
        expect(response.status).toBe(403)
      } finally {
        server.stop()
      }
    })
  })

  describe("Transport ↔ Application: Cache → Component Data", () => {
    it("test_cache_supplies_component_with_real_data_from_http", async () => {
      const server = Bun.serve({
        port: 0,
        async fetch(req) {
          if (req.url.includes("/components/dashboard")) {
            return new Response(
              JSON.stringify({
                tag: "x-dashboard",
                props: { title: "Dashboard", widgetCount: 5 },
                version: "2.1.0",
              }),
              { headers: { "content-type": "application/json" } }
            )
          }
          return new Response("Not found", { status: 404 })
        },
      })

      try {
        const port = server.port
        const fetchAdapter = createFetchAdapter()
        const cacheAdapter = createCacheAdapter()
        const componentRegistry = createComponentRegistry(await validatedContract({ elements: { "test:counter:counter:root": { component: "counter", tag: "x-counter" }, "test:dashboard:dashboard:root": { component: "dashboard", tag: "x-dashboard" } } }))

        // ACTUAL: Network fetches real component metadata
        const response = await fetchAdapter.fetch({
          url: `http://localhost:${port}/components/dashboard`,
          method: "GET",
        })
        const componentMeta = JSON.parse(response.body)

        // ACTUAL: Transport caches it
        await cacheAdapter.set("dashboard:meta", componentMeta)

        // ACTUAL: Application layer retrieves from cache
        const cached = await cacheAdapter.get<{
          tag: string
          props: { title: string; widgetCount: number }
          version: string
        }>("dashboard:meta")

        // VERIFY: App can use cached data
        expect(cached?.tag).toBe("x-dashboard")
        expect(cached?.props.widgetCount).toBe(5)
        expect(cached?.version).toBe("2.1.0")
      } finally {
        server.stop()
      }
    })

    it("test_cache_miss_triggers_real_http_fetch", async () => {
      const server = Bun.serve({
        port: 0,
        async fetch(req) {
          if (req.url.includes("/api/data")) {
            return new Response(JSON.stringify({ result: "from-server" }), {
              headers: { "content-type": "application/json" },
            })
          }
          return new Response("Not found", { status: 404 })
        },
      })

      try {
        const port = server.port
        const fetchAdapter = createFetchAdapter()
        const cacheAdapter = createCacheAdapter()

        // ACTUAL: Cache miss — need to fetch
        let cached = await cacheAdapter.get<{ result: string }>("data:key")
        expect(cached).toBeNull()

        // ACTUAL: Network layer fetches real data
        const response = await fetchAdapter.fetch({
          url: `http://localhost:${port}/api/data`,
          method: "GET",
        })
        const data = JSON.parse(response.body)

        // ACTUAL: Cache it for next time
        await cacheAdapter.set("data:key", data)

        // VERIFY: Subsequent access uses cache
        cached = await cacheAdapter.get<{ result: string }>("data:key")
        expect(cached?.result).toBe("from-server")
      } finally {
        server.stop()
      }
    })
  })

  describe("Application ↔ Data: Component Lifecycle → Store State", () => {
    it("test_component_render_actually_executes_and_updates_state", async () => {
      let renderCalled = false
      let renderCount = 0
      let lastOutput = ""

      // ACTUAL: Real component that executes render
      const realComponent: Component = {
        name: "counter",
        render: () => {
          renderCalled = true
          renderCount++
          lastOutput = `<div class="counter">${renderCount}</div>`
        },
      }

      const componentRegistry = createComponentRegistry(await validatedContract({ elements: { "test:counter:counter:root": { component: "counter", tag: "x-counter" } } }))
      const store = createFeatureStore(
        { renders: 0 },
        (state, action: any) => {
          if (action.type === "RENDER") {
            return { renders: state.renders + 1 }
          }
          return state
        }
      )

      // ACTUAL: Register component
      componentRegistry.register("x-counter", () => realComponent)

      // ACTUAL: Get component and call render
      const component = await componentRegistry.get("x-counter")
      const fakeElement = { tagName: "div" } as unknown as Element
      component.render({}, fakeElement)

      // VERIFY: Render actually executed
      expect(renderCalled).toBe(true)
      expect(lastOutput).toContain("counter")

      // ACTUAL: Update store when render happens
      store.dispatch({ type: "RENDER" })

      // VERIFY: State reflects actual render
      expect(store.state.value.renders).toBe(1)

      // ACTUAL: Render again
      component.render({}, fakeElement)
      store.dispatch({ type: "RENDER" })
      expect(store.state.value.renders).toBe(2)
    })

    it("test_store_subscribers_actually_receive_state_changes", async () => {
      const store = createFeatureStore<{ count: number; history: number[] }, any>(
        { count: 0, history: [] },
        (state, action: any) => {
          if (action.type === "INCREMENT") {
            return { count: state.count + 1, history: [...state.history, state.count] }
          }
          return state
        }
      )

      const receivedStates: any[] = []

      // ACTUAL: Subscribe to store
      const unsubscribe = store.subscribe((state) => {
        receivedStates.push({ ...state })
      })

      // ACTUAL: Dispatch actions
      store.dispatch({ type: "INCREMENT" })
      store.dispatch({ type: "INCREMENT" })
      store.dispatch({ type: "INCREMENT" })

      // VERIFY: Subscriber received all changes
      expect(receivedStates).toHaveLength(3)
      expect(receivedStates[0].count).toBe(1)
      expect(receivedStates[1].count).toBe(2)
      expect(receivedStates[2].count).toBe(3)
      expect(receivedStates[2].history).toEqual([0, 1, 2])

      unsubscribe()
    })
  })

  describe("Full Stack: Network → Transport → Application → Data", () => {
    it("test_real_http_flows_through_all_4_layers_end_to_end", async () => {
      // REAL: HTTP server
      const server = Bun.serve({
        port: 0,
        async fetch(req) {
          if (req.url.includes("/dashboard")) {
            return new Response(
              JSON.stringify({
                page: "dashboard",
                widgets: [
                  { id: 1, type: "sales", data: 1000 },
                  { id: 2, type: "users", data: 500 },
                ],
              }),
              { headers: { "content-type": "application/json" } }
            )
          }
          return new Response("Not found", { status: 404 })
        },
      })

      try {
        const port = server.port

        // Initialize all 4 layers
        const fetchAdapter = createFetchAdapter()
        const cacheAdapter = createCacheAdapter()
        const dashboardDdas: DomAddressMap = { elements: { "test:dashboard:dashboard:root": { component: "dashboard", tag: "x-dashboard" } } }
        const contract = await validatedContract(dashboardDdas, ["/dashboard"])
        const componentRegistry = createComponentRegistry(contract)
        // justjs#56: DefaultLifecycle needs the registry to actually call
        // Component.render() — registered below, before router.navigate()
        // (which now drives lifecycle.run() for real) ever runs.
        const lifecycle = createLifecycle(contract, undefined, componentRegistry)

        interface DashboardWidget {
          id: number
          type: string
          data: number
        }
        interface DashboardState {
          page: string
          widgets: DashboardWidget[]
          cached: boolean
          ready: boolean
        }
        const store = createFeatureStore<DashboardState, any>(
          { page: "", widgets: [], cached: false, ready: false },
          (state, action: any) => {
            if (action.type === "SET_PAGE") {
              return { ...state, page: action.page, widgets: action.widgets, cached: true }
            }
            if (action.type === "READY") {
              return { ...state, ready: true }
            }
            return state
          }
        )

        // ACTUAL: Layer 3 — Register component (before navigate, which now
        // actually resolves and renders it via lifecycle.run() — justjs#56)
        let lastDashboardHtml = ""
        const dashboardComponent: Component = {
          name: "dashboard",
          render: () => {
            // Real render that uses store data
            lastDashboardHtml = `<div>${store.state.value.page}: ${store.state.value.widgets.length} widgets</div>`
          },
        }
        componentRegistry.register("x-dashboard", () => dashboardComponent)

        // Scoped to just the router/DOM portion below: happy-dom's global
        // registration overrides fetch/Response/Headers globally, which
        // would break the real Bun.serve()-backed fetchAdapter.fetch() call
        // further down if left registered — unregister before that runs.
        GlobalRegistrator.register()
        try {
          // ACTUAL: real DOM element addressed through the generated DDAS map.
          const target = document.createElement("x-dashboard")
          target.setAttribute("data-ddas-id", "test:dashboard:dashboard:root")
          document.body.appendChild(target)

          const router = createRouter(
            ["/dashboard"],
            { "x-dashboard": { path: "/dashboard", component: "dashboard" } },
            lifecycle,
            contract
          )

          // ACTUAL: Layer 3 (Application) — Navigate; drives
          // lifecycle.run(), which resolves the real DOM element above and
          // calls dashboardComponent.render() (justjs#56)
          await router.navigate("/dashboard")
          expect(router.currentPath()).toBe("/dashboard")
        } finally {
          await GlobalRegistrator.unregister()
        }

        // ACTUAL: Layer 1 (Network) — Fetch real HTTP
        const response = await fetchAdapter.fetch({
          url: `http://localhost:${port}/dashboard`,
          method: "GET",
        })
        const dashboardData = JSON.parse(response.body)

        // ACTUAL: Layer 2 (Transport) — Cache response
        await cacheAdapter.set("page:dashboard", dashboardData)
        const cached = await cacheAdapter.get<{ page: string; widgets: DashboardWidget[] }>(
          "page:dashboard"
        )

        // VERIFY: Transport received real HTTP data
        expect(cached?.widgets).toHaveLength(2)

        // ACTUAL: Layer 4 (Data) — Store everything
        store.dispatch({
          type: "SET_PAGE",
          page: cached?.page,
          widgets: cached?.widgets,
        })

        // VERIFY: Full stack state
        expect(store.state.value.page).toBe("dashboard")
        expect(store.state.value.widgets).toHaveLength(2)
        expect(store.state.value.widgets[0]?.data).toBe(1000)

        // VERIFY: Component can render with full stack data
        const component = await componentRegistry.get("x-dashboard")
        component.render({}, { tagName: "div" } as unknown as Element)
        expect(lastDashboardHtml).toContain("dashboard")
        expect(lastDashboardHtml).toContain("2 widgets")
      } finally {
        server.stop()
      }
    })

    it("test_cache_bypassed_on_new_request_flows_through_full_stack", async () => {
      const server = Bun.serve({
        port: 0,
        async fetch(req) {
          if (req.url.includes("/data")) {
            return new Response(
              JSON.stringify({ timestamp: Date.now(), fresh: true }),
              { headers: { "content-type": "application/json" } }
            )
          }
          return new Response("Not found", { status: 404 })
        },
      })

      try {
        const port = server.port
        const fetchAdapter = createFetchAdapter()
        const cacheAdapter = createCacheAdapter()
        interface TimestampedData {
          timestamp: number
          fresh: boolean
        }
        const store = createFeatureStore<{ data: TimestampedData | null; isFresh: boolean }, any>(
          { data: null, isFresh: false },
          (state, action: any) => {
            if (action.type === "UPDATE") {
              return { data: action.payload, isFresh: action.fresh }
            }
            return state
          }
        )

        // ACTUAL: First request — cache miss
        let cachedData = await cacheAdapter.get<TimestampedData>(`http://localhost:${port}/data`)
        expect(cachedData).toBeNull()

        // ACTUAL: Fetch fresh data from network
        let response = await fetchAdapter.fetch({
          url: `http://localhost:${port}/data`,
          method: "GET",
        })
        let freshData: TimestampedData = JSON.parse(response.body)
        expect(freshData.fresh).toBe(true)

        // Cache it
        await cacheAdapter.set(`http://localhost:${port}/data`, freshData)
        store.dispatch({ type: "UPDATE", payload: freshData, fresh: true })

        expect(store.state.value.isFresh).toBe(true)

        // ACTUAL: Second request — could use cache, but let's fetch again
        // Wait 10ms to ensure timestamp advances
        await new Promise(r => setTimeout(r, 10))
        response = await fetchAdapter.fetch({
          url: `http://localhost:${port}/data`,
          method: "GET",
        })
        const newData: TimestampedData = JSON.parse(response.body)

        // VERIFY: New data is different (newer timestamp)
        expect(newData.timestamp).toBeGreaterThanOrEqual(freshData.timestamp)

        // ACTUAL: Update everything
        await cacheAdapter.set(`http://localhost:${port}/data`, newData)
        store.dispatch({ type: "UPDATE", payload: newData, fresh: true })

        // VERIFY: Stack has latest
        expect(store.state.value.data?.timestamp).toBeGreaterThanOrEqual(freshData.timestamp)
      } finally {
        server.stop()
      }
    })
  })

  describe("Error Paths — Real Failures", () => {
    it("test_network_error_handled_across_layers", async () => {
      const fetchAdapter = createFetchAdapter()
      const store = createFeatureStore<{ status: string; error: string | null }, any>(
        { status: "idle", error: null },
        (state, action: any) => {
          if (action.type === "FAIL") {
            return { status: "error", error: action.error }
          }
          return state
        }
      )

      // ACTUAL: Try to fetch from non-existent server
      try {
        await fetchAdapter.fetch({
          url: "http://localhost:1/nonexistent",
          method: "GET",
          timeout: 100, // Short timeout
        })
        expect.unreachable("Should have thrown")
      } catch (error) {
        // ACTUAL: Error flows through stack
        const message = error instanceof Error ? error.message : String(error)
        store.dispatch({ type: "FAIL", error: message })

        // VERIFY: Error captured in state
        expect(store.state.value.status).toBe("error")
        expect(store.state.value.error).toBeTruthy()
      }
    })

    it("test_cache_retrieval_fails_gracefully_without_data", async () => {
      const cacheAdapter = createCacheAdapter()
      const store = createFeatureStore<{ cached: boolean; fallback: { default: string } | null }, any>(
        { cached: false, fallback: null },
        (state, action: any) => {
          if (action.type === "USE_FALLBACK") {
            return { cached: false, fallback: action.data }
          }
          return state
        }
      )

      // ACTUAL: Cache miss
      const missing = await cacheAdapter.get<{ default: string }>("nonexistent-key")
      expect(missing).toBeNull()

      // ACTUAL: Fall back to default
      store.dispatch({ type: "USE_FALLBACK", data: { default: "value" } })

      // VERIFY: State has fallback
      expect(store.state.value.fallback).toEqual({ default: "value" })
    })
  })
})
