import { describe, it, expect, beforeEach } from "bun:test"
import { justjs }                            from "@justjs/application"
import { DefaultSecurityProvider }           from "../core/default_security.js"
import { NoopSecurityContext }               from "../api/provider.js"

describe("DefaultSecurityProvider", () => {
  it("test_concern_is_security", () => {
    const provider = new DefaultSecurityProvider()
    expect(provider.concern).toBe("security")
  })

  it("test_strategy_is_noop", () => {
    const provider = new DefaultSecurityProvider()
    expect(provider.strategy).toBe("noop")
  })

  it("test_factory_returns_aspect_with_correct_concern", () => {
    const provider = new DefaultSecurityProvider()
    const aspect   = provider.factory()
    expect(aspect.concern).toBe("security")
  })

  it("test_factory_returns_aspect_with_noop_strategy", () => {
    const provider = new DefaultSecurityProvider()
    const aspect   = provider.factory()
    expect(aspect.strategy).toBe("noop")
  })
})

describe("NoopSecurityContext", () => {
  let ctx: NoopSecurityContext

  beforeEach(() => { ctx = new NoopSecurityContext() })

  it("test_principal_returns_null_when_not_authenticated", () => {
    expect(ctx.principal()).toBeNull()
  })

  it("test_is_authenticated_returns_false", () => {
    expect(ctx.isAuthenticated()).toBe(false)
  })

  it("test_has_role_returns_false_for_any_role", () => {
    expect(ctx.hasRole("admin")).toBe(false)
    expect(ctx.hasRole("user")).toBe(false)
  })

  it("test_has_permission_returns_false_for_any_permission", () => {
    expect(ctx.hasPermission("read:data")).toBe(false)
  })

  it("test_token_returns_null", () => {
    expect(ctx.token()).toBeNull()
  })
})

describe("security SPI self-registration", () => {
  it("test_provider_registers_with_justjs_on_import", async () => {
    await import("../spi/index.js")
    const resolved = justjs.providers.resolve("security", "noop")
    expect(resolved).not.toBeNull()
    expect(resolved!.concern).toBe("security")
    expect(resolved!.strategy).toBe("noop")
  })
})
