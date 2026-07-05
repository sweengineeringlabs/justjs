import { describe, it, expect } from "bun:test"
import {
  escapeHtml,
  validateImportMap,
  inlineImportmap,
  extractImportsFromCode,
  validateTreeShaking,
  generateBundleResult,
} from "../core/bundler.js"
import type { ImportMap } from "../api/bundle.js"
import { BuildError } from "../api/bundle.js"

const mockImportmap: ImportMap = {
  imports: {
    "@justjs/core": "/vendor/core-abc123.js",
    "@justjs/aop-security-oauth": "/vendor/security-oauth-def456.js",
    "@justjs/aop-observability-datadog": "/vendor/observability-datadog-ghi789.js",
  },
}

describe("build", () => {
  describe("escapeHtml", () => {
    it("test_escape_script_tags", () => {
      expect(escapeHtml("<script>")).toContain("&lt;script&gt;")
    })

    it("test_escape_quotes_in_html", () => {
      expect(escapeHtml('class="test"')).toContain("&quot;")
    })
  })

  describe("validateImportMap", () => {
    it("test_validate_valid_importmap", () => {
      expect(() => validateImportMap(mockImportmap)).not.toThrow()
    })

    it("test_validate_empty_imports_throws_error", () => {
      expect(() =>
        validateImportMap({ imports: {} })
      ).not.toThrow()
    })

    it("test_validate_missing_imports_throws_error", () => {
      expect(() => validateImportMap({} as ImportMap)).toThrow(BuildError)
    })

    it("test_validate_invalid_specifier_throws_error", () => {
      expect(() =>
        validateImportMap({ imports: { "": "/test.js" } })
      ).toThrow(BuildError)
    })

    it("test_validate_invalid_url_throws_error", () => {
      expect(() =>
        validateImportMap({ imports: { "@test/pkg": "" } })
      ).toThrow(BuildError)
    })
  })

  describe("inlineImportmap", () => {
    it("test_inline_importmap_includes_script_tag", () => {
      const result = inlineImportmap("console.log('test')", mockImportmap)

      expect(result.html).toContain('<script type="importmap">')
      expect(result.html).toContain("</script>")
    })

    it("test_inline_importmap_includes_bundle", () => {
      const bundleCode = "import boot from '@justjs/core'; boot()"
      const result = inlineImportmap(bundleCode, mockImportmap)

      expect(result.html).toContain("<script>")
      expect(result.html).toContain(bundleCode)
    })

    it("test_inline_importmap_returns_valid_html", () => {
      const result = inlineImportmap("console.log('test')", mockImportmap)

      expect(result.html).toContain("<!DOCTYPE html>")
      expect(result.html).toContain("<html>")
      expect(result.html).toContain("</html>")
      expect(result.html).toContain('<div id="app"></div>')
    })

    it("test_inline_importmap_json_valid", () => {
      const result = inlineImportmap("", mockImportmap)

      expect(result.importmapScript).toContain("@justjs/core")
      expect(result.importmapScript).toContain("/vendor/core-abc123.js")
    })
  })

  describe("extractImportsFromCode", () => {
    it("test_extract_named_imports", () => {
      const code = `import { boot } from "@justjs/core"`
      const imports = extractImportsFromCode(code)

      expect(imports).toContain("@justjs/core")
    })

    it("test_extract_default_imports", () => {
      const code = `import boot from "@justjs/core"`
      const imports = extractImportsFromCode(code)

      expect(imports).toContain("@justjs/core")
    })

    it("test_extract_ignores_relative_imports", () => {
      const code = `import { foo } from "./lib.js"`
      const imports = extractImportsFromCode(code)

      expect(imports).not.toContain("./lib.js")
    })

    it("test_extract_multiple_imports", () => {
      const code = `
import { boot } from "@justjs/core"
import { render } from "@justjs/ssr"
`
      const imports = extractImportsFromCode(code)

      expect(imports).toContain("@justjs/core")
      expect(imports).toContain("@justjs/ssr")
      expect(imports).toHaveLength(2)
    })

    it("test_extract_deduplicates_imports", () => {
      const code = `
import { boot } from "@justjs/core"
import { config } from "@justjs/core"
`
      const imports = extractImportsFromCode(code)

      expect(imports.filter((i) => i === "@justjs/core")).toHaveLength(1)
    })
  })

  describe("validateTreeShaking", () => {
    it("test_validate_tree_shaking_with_valid_imports", () => {
      const code = `import { boot } from "@justjs/core"`
      expect(() => validateTreeShaking(code, mockImportmap)).not.toThrow()
    })

    it("test_validate_tree_shaking_throws_on_unknown_import", () => {
      const code = `import { foo } from "@unknown/package"`
      expect(() => validateTreeShaking(code, mockImportmap)).toThrow(BuildError)
    })

    it("test_validate_tree_shaking_ignores_relative_imports", () => {
      const code = `
import { boot } from "@justjs/core"
import { helper } from "./helper.js"
`
      expect(() => validateTreeShaking(code, mockImportmap)).not.toThrow()
    })

    it("test_validate_tree_shaking_returns_used_imports", () => {
      const code = `
import { boot } from "@justjs/core"
import { render } from "@justjs/aop-security-oauth"
`
      const result = validateTreeShaking(code, mockImportmap)

      expect(result).toContain("@justjs/core")
      expect(result).toContain("@justjs/aop-security-oauth")
      expect(result).toHaveLength(2)
    })
  })

  describe("generateBundleResult", () => {
    it("test_generate_bundle_result_with_valid_code", () => {
      const code = `import { boot } from "@justjs/core"; boot()`
      const result = generateBundleResult(code, mockImportmap)

      expect(result.code).toBe(code)
      expect(result.size).toBe(code.length)
      expect(result.importsUsed).toContain("@justjs/core")
    })

    it("test_generate_bundle_result_calculates_size", () => {
      const code = "const x = 42"
      const result = generateBundleResult(code, mockImportmap)

      expect(result.size).toBe(12)
    })

    it("test_generate_bundle_result_throws_on_invalid_imports", () => {
      const code = `import { foo } from "@unknown/pkg"`
      expect(() => generateBundleResult(code, mockImportmap)).toThrow(BuildError)
    })
  })
})
