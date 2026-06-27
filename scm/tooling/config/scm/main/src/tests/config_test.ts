import { describe, it, expect } from "bun:test"
import { DefaultSchemaRegistry } from "../core/registry.js"
import { VITE_CONFIG_SCHEMA, SSR_CONFIG_SCHEMA, BUILD_CONFIG_SCHEMA } from "../core/builtin_schemas.js"

describe("DefaultSchemaRegistry", () => {
  it("test_registry_has_builtin_schemas_on_creation", () => {
    const registry = new DefaultSchemaRegistry()

    expect(registry.get("vite")).toBeDefined()
    expect(registry.get("ssr")).toBeDefined()
    expect(registry.get("build")).toBeDefined()
  })

  it("test_validate_vite_config_with_required_configPath", () => {
    const registry = new DefaultSchemaRegistry()
    const validConfig = { configPath: "./src/justjs.config.toml" }

    const result = registry.validate(validConfig, "vite")

    expect(result.valid).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it("test_validate_vite_config_rejects_missing_configPath", () => {
    const registry = new DefaultSchemaRegistry()
    const invalidConfig = { appFile: "./src/app.ts" }

    const result = registry.validate(invalidConfig, "vite")

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining("Required"),
      })
    )
  })

  it("test_validate_ssr_config_accepts_optional_fields", () => {
    const registry = new DefaultSchemaRegistry()
    const sseConfig = { declarativeShadowDom: true, compress: false }

    const result = registry.validate(sseConfig, "ssr")

    expect(result.valid).toBe(true)
  })

  it("test_validate_build_config_with_entrypoint", () => {
    const registry = new DefaultSchemaRegistry()
    const buildConfig = { entrypoint: "./src/main.ts", outDir: "./dist" }

    const result = registry.validate(buildConfig, "build")

    expect(result.valid).toBe(true)
  })

  it("test_validate_unknown_schema_returns_error", () => {
    const registry = new DefaultSchemaRegistry()

    const result = registry.validate({}, "nonexistent")

    expect(result.valid).toBe(false)
    expect(result.errors?.[0].message).toContain("not found")
  })

  it("test_register_custom_schema_and_validate", () => {
    const registry = new DefaultSchemaRegistry()
    registry.register({
      name: "custom",
      schema: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    })

    const result = registry.validate({ name: "test" }, "custom")

    expect(result.valid).toBe(true)
  })

  it("test_list_schemas_returns_all_registered", () => {
    const registry = new DefaultSchemaRegistry()

    const schemas = registry.list()

    expect(schemas.length).toBeGreaterThanOrEqual(3)
    expect(schemas.map((s) => s.name)).toContain("vite")
    expect(schemas.map((s) => s.name)).toContain("ssr")
    expect(schemas.map((s) => s.name)).toContain("build")
  })
})
