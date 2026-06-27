import { describe, it, expect } from "bun:test"
import { ConfigParser } from "../core/config_parser.js"
import type { JustJSConfig } from "../api/config.js"

describe("ConfigParser", () => {
  it("test_parseToml_reads_security_section", () => {
    const toml = `
[security]
strategy = "oauth"
on = ["/dashboard"]
`
    const config = ConfigParser.parseToml(toml)
    expect(config.security).toBeDefined()
    expect(config.security!.strategy).toBe("oauth")
    expect(config.security!.on).toContain("/dashboard")
  })

  it("test_parseToml_reads_observability_section", () => {
    const toml = `
[observability]
strategy = "datadog"
all = true
`
    const config = ConfigParser.parseToml(toml)
    expect(config.observability).toBeDefined()
    expect(config.observability!.strategy).toBe("datadog")
    expect(config.observability!.all).toBe(true)
  })

  it("test_parseToml_reads_multiple_sections", () => {
    const toml = `
[security]
strategy = "oauth"

[observability]
strategy = "datadog"

[i18n]
strategy = "fluent"
all = true
`
    const config = ConfigParser.parseToml(toml)
    expect(config.security!.strategy).toBe("oauth")
    expect(config.observability!.strategy).toBe("datadog")
    expect(config.i18n!.strategy).toBe("fluent")
    expect(config.i18n!.all).toBe(true)
  })

  it("test_generateAppCode_creates_imports", () => {
    const config: JustJSConfig = {
      security: { strategy: "oauth" },
      observability: { strategy: "datadog" },
    }
    const result = ConfigParser.generateAppCode(config, {}, {}, {}, {})
    expect(result.imports).toContain("import \"@justjs/security-oauth\"")
    expect(result.imports).toContain("import \"@justjs/observability-datadog\"")
  })

  it("test_generateAppCode_creates_boot_call_with_on_routes", () => {
    const config: JustJSConfig = {
      security: { strategy: "oauth", on: ["/dashboard", "/account"] },
    }
    const result = ConfigParser.generateAppCode(config, {}, {}, {}, {})
    expect(result.bootCall).toContain("strategy: \"oauth\"")
    expect(result.bootCall).toContain('on: ["/dashboard", "/account"]')
  })

  it("test_generateAppCode_creates_boot_call_with_all", () => {
    const config: JustJSConfig = {
      observability: { strategy: "datadog", all: true },
    }
    const result = ConfigParser.generateAppCode(config, {}, {}, {}, {})
    expect(result.bootCall).toContain("observability")
    expect(result.bootCall).toContain("all: true")
  })

  it("test_generateAppCode_omits_sections_without_strategy", () => {
    const config: any = {
      security: { strategy: "oauth" },
      observability: {},
    }
    const result = ConfigParser.generateAppCode(config, {}, {}, {}, {})
    expect(result.bootCall).toContain("security")
    expect(result.bootCall).not.toContain("observability")
  })

  it("test_parseToml_ignores_comments", () => {
    const toml = `
# Configuration for JustJS
[security]
strategy = "oauth"  # Use OAuth provider
`
    const config = ConfigParser.parseToml(toml)
    expect(config.security!.strategy).toBe("oauth")
  })

  it("test_parseToml_handles_except_routes", () => {
    const toml = `
[security]
strategy = "oauth"
except = ["/public", "/health"]
`
    const config = ConfigParser.parseToml(toml)
    expect(config.security!.except).toContain("/public")
    expect(config.security!.except).toContain("/health")
  })

  it("test_generateAppCode_includes_routes_importmap_registry_dommap", () => {
    const config: JustJSConfig = {
      security: { strategy: "oauth" },
    }
    const result = ConfigParser.generateAppCode(config, {}, {}, {}, {})
    expect(result.bootCall).toContain("routes")
    expect(result.bootCall).toContain("importmap")
    expect(result.bootCall).toContain("registry")
    expect(result.bootCall).toContain("domMap")
  })
})
