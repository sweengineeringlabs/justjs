import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { justjs }                                        from "@justjs/application"
import type { ApiAdapter, ApiRequest, ApiResponse }       from "@justjs/transport"
import { BearerSecurityProvider, createBearerApiAdapter } from "../core/bearer_security.js"

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null { return this.store.get(key) ?? null }
  setItem(key: string, value: string): void { this.store.set(key, value) }
  removeItem(key: string): void { this.store.delete(key) }
}

function base64UrlEncode(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function makeJwt(payload: Record<string, unknown>): string {
  return `${base64UrlEncode({ alg: "none", typ: "JWT" })}.${base64UrlEncode(payload)}.fake-signature`
}

const TOKEN_KEY = "justjs:bearer-token"

beforeEach(() => {
  // @ts-expect-error - shimming the browser global for this Bun test env
  globalThis.localStorage = new MemoryStorage()
})

afterEach(() => {
  // @ts-expect-error - restoring the real (absent) global after each test
  delete globalThis.localStorage
})

describe("BearerSecurityProvider", () => {
  it("test_concern_is_security", () => {
    expect(new BearerSecurityProvider().concern).toBe("security")
  })

  it("test_strategy_is_bearer", () => {
    expect(new BearerSecurityProvider().strategy).toBe("bearer")
  })

  it("test_factory_returns_aspect_with_bearer_strategy", () => {
    const aspect = new BearerSecurityProvider().factory()
    expect(aspect.concern).toBe("security")
    expect(aspect.strategy).toBe("bearer")
  })
})

describe("BearerSecurityContext against a real JWT", () => {
  it("test_token_reads_from_localStorage_default_key", () => {
    const jwt = makeJwt({ sub: "user-1" })
    localStorage.setItem(TOKEN_KEY, jwt)
    const ctx = new BearerSecurityProvider().factory().context()

    expect(ctx.token()).toBe(jwt)
  })

  it("test_token_reads_from_a_custom_storage_key", () => {
    const jwt = makeJwt({ sub: "user-1" })
    localStorage.setItem("custom-key", jwt)
    const ctx = new BearerSecurityProvider().factory({ tokenStorageKey: "custom-key" }).context()

    expect(ctx.token()).toBe(jwt)
  })

  it("test_token_returns_null_when_nothing_stored", () => {
    const ctx = new BearerSecurityProvider().factory().context()
    expect(ctx.token()).toBeNull()
  })

  it("test_principal_decodes_real_claims_from_the_jwt", () => {
    localStorage.setItem(TOKEN_KEY, makeJwt({ sub: "user-42", roles: ["admin"], permissions: ["read:data"] }))
    const ctx = new BearerSecurityProvider().factory().context()

    expect(ctx.principal()).toEqual({ userId: "user-42", roles: ["admin"], permissions: ["read:data"] })
  })

  it("test_principal_defaults_roles_and_permissions_to_empty_when_claims_absent", () => {
    localStorage.setItem(TOKEN_KEY, makeJwt({ sub: "user-42" }))
    const ctx = new BearerSecurityProvider().factory().context()

    expect(ctx.principal()).toEqual({ userId: "user-42", roles: [], permissions: [] })
  })

  it("test_principal_returns_null_when_no_token_stored", () => {
    const ctx = new BearerSecurityProvider().factory().context()
    expect(ctx.principal()).toBeNull()
  })

  it("test_principal_returns_null_when_token_has_no_sub_claim", () => {
    localStorage.setItem(TOKEN_KEY, makeJwt({ roles: ["admin"] }))
    const ctx = new BearerSecurityProvider().factory().context()
    expect(ctx.principal()).toBeNull()
  })

  it("test_principal_returns_null_for_a_malformed_token_without_throwing", () => {
    localStorage.setItem(TOKEN_KEY, "not-a-real-jwt")
    const ctx = new BearerSecurityProvider().factory().context()
    expect(() => ctx.principal()).not.toThrow()
    expect(ctx.principal()).toBeNull()
  })

  it("test_isAuthenticated_true_for_a_valid_non_expired_token", () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem(TOKEN_KEY, makeJwt({ sub: "user-1", exp: futureExp }))
    const ctx = new BearerSecurityProvider().factory().context()

    expect(ctx.isAuthenticated()).toBe(true)
  })

  it("test_isAuthenticated_false_for_an_expired_token", () => {
    const pastExp = Math.floor(Date.now() / 1000) - 3600
    localStorage.setItem(TOKEN_KEY, makeJwt({ sub: "user-1", exp: pastExp }))
    const ctx = new BearerSecurityProvider().factory().context()

    expect(ctx.isAuthenticated()).toBe(false)
  })

  it("test_isAuthenticated_false_when_no_token_stored", () => {
    const ctx = new BearerSecurityProvider().factory().context()
    expect(ctx.isAuthenticated()).toBe(false)
  })

  it("test_hasRole_reflects_real_jwt_role_claims", () => {
    localStorage.setItem(TOKEN_KEY, makeJwt({ sub: "user-1", roles: ["editor"] }))
    const ctx = new BearerSecurityProvider().factory().context()

    expect(ctx.hasRole("editor")).toBe(true)
    expect(ctx.hasRole("admin")).toBe(false)
  })

  it("test_hasPermission_reflects_real_jwt_permission_claims", () => {
    localStorage.setItem(TOKEN_KEY, makeJwt({ sub: "user-1", permissions: ["write:data"] }))
    const ctx = new BearerSecurityProvider().factory().context()

    expect(ctx.hasPermission("write:data")).toBe(true)
    expect(ctx.hasPermission("delete:data")).toBe(false)
  })
})

function createRecordingAdapter() {
  const calls: Array<{ method: string; url: string; body?: unknown; options?: Partial<ApiRequest> }> = []
  const ok = <T>(): Promise<ApiResponse<T>> => Promise.resolve({ status: 200, data: {} as T, headers: {} })
  const adapter: ApiAdapter = {
    get: (url, options) => { calls.push({ method: "GET", url, options }); return ok() },
    post: (url, body, options) => { calls.push({ method: "POST", url, body, options }); return ok() },
    put: (url, body, options) => { calls.push({ method: "PUT", url, body, options }); return ok() },
    delete: (url, options) => { calls.push({ method: "DELETE", url, options }); return ok() },
  }
  return { adapter, calls }
}

describe("createBearerApiAdapter", () => {
  it("test_attaches_authorization_header_on_get_when_token_present", async () => {
    localStorage.setItem(TOKEN_KEY, "the-real-token")
    const { adapter, calls } = createRecordingAdapter()
    const wrapped = createBearerApiAdapter(adapter)

    await wrapped.get("/api/things")

    expect(calls[0]!.options?.headers?.Authorization).toBe("Bearer the-real-token")
  })

  it("test_attaches_authorization_header_on_post_put_delete", async () => {
    localStorage.setItem(TOKEN_KEY, "the-real-token")
    const { adapter, calls } = createRecordingAdapter()
    const wrapped = createBearerApiAdapter(adapter)

    await wrapped.post("/api/things", { a: 1 })
    await wrapped.put("/api/things/1", { a: 2 })
    await wrapped.delete("/api/things/1")

    for (const call of calls) {
      expect(call.options?.headers?.Authorization).toBe("Bearer the-real-token")
    }
  })

  it("test_does_not_attach_header_when_no_token_stored", async () => {
    const { adapter, calls } = createRecordingAdapter()
    const wrapped = createBearerApiAdapter(adapter)

    await wrapped.get("/api/things")

    expect(calls[0]!.options?.headers?.Authorization).toBeUndefined()
  })

  it("test_preserves_caller_supplied_headers_and_options", async () => {
    localStorage.setItem(TOKEN_KEY, "the-real-token")
    const { adapter, calls } = createRecordingAdapter()
    const wrapped = createBearerApiAdapter(adapter)

    await wrapped.get("/api/things", { headers: { "X-Trace": "abc" }, timeout: 5000 })

    expect(calls[0]!.options).toEqual({
      headers: { "X-Trace": "abc", Authorization: "Bearer the-real-token" },
      timeout: 5000,
    })
  })

  it("test_calls_still_reach_the_inner_adapter_and_return_its_response", async () => {
    const { adapter } = createRecordingAdapter()
    const wrapped = createBearerApiAdapter(adapter)

    const response = await wrapped.get<{ ok: boolean }>("/api/things")

    expect(response.status).toBe(200)
  })

  it("test_honors_a_custom_tokenStorageKey", async () => {
    localStorage.setItem("custom-key", "custom-token")
    const { adapter, calls } = createRecordingAdapter()
    const wrapped = createBearerApiAdapter(adapter, { tokenStorageKey: "custom-key" })

    await wrapped.get("/api/things")

    expect(calls[0]!.options?.headers?.Authorization).toBe("Bearer custom-token")
  })
})

describe("security SPI self-registration of the bearer strategy", () => {
  it("test_bearer_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = justjs.providers.resolve("security", "bearer")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("security")
    expect(resolved!.strategy).toBe("bearer")
  })
})
