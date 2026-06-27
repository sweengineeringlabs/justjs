import { describe, it, expect } from "bun:test"
import { parseToml } from "../core/toml-parser"

describe("toml-parser", () => {
  it("test_parse_empty_string_returns_empty_object", () => {
    const result = parseToml("")
    expect(result).toEqual({})
  })

  it("test_parse_comments_ignored", () => {
    const toml = `
# This is a comment
key = "value"
# Another comment
`
    const result = parseToml(toml)
    expect(result.key).toBe("value")
  })

  it("test_parse_section_header", () => {
    const toml = `
[security]
strategy = "oauth"
`
    const result = parseToml(toml)
    expect(result.security).toEqual({ strategy: "oauth" })
  })

  it("test_parse_string_value", () => {
    const toml = `key = "value"`
    const result = parseToml(toml)
    expect(result.key).toBe("value")
  })

  it("test_parse_boolean_true", () => {
    const toml = `key = true`
    const result = parseToml(toml)
    expect(result.key).toBe(true)
  })

  it("test_parse_boolean_false", () => {
    const toml = `key = false`
    const result = parseToml(toml)
    expect(result.key).toBe(false)
  })

  it("test_parse_array_of_strings", () => {
    const toml = `paths = ["/dashboard", "/account", "/settings"]`
    const result = parseToml(toml)
    expect(result.paths).toEqual(["/dashboard", "/account", "/settings"])
  })

  it("test_parse_multiple_sections", () => {
    const toml = `
[security]
strategy = "oauth"

[observability]
strategy = "datadog"
all = true
`
    const result = parseToml(toml)
    expect(result.security).toEqual({ strategy: "oauth" })
    expect(result.observability).toEqual({ strategy: "datadog", all: true })
  })

  it("test_parse_section_with_multiple_keys", () => {
    const toml = `
[security]
strategy = "oauth"
on = ["/dashboard"]
except = ["/"]
`
    const result = parseToml(toml)
    expect(result.security).toEqual({
      strategy: "oauth",
      on: ["/dashboard"],
      except: ["/"],
    })
  })
})
