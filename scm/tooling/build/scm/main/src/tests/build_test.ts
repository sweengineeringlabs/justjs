import { describe, it, expect } from "bun:test"
import { BundlePipeline } from "../core/bundler.js"
import type { Importmap } from "../api/bundler.js"

describe("BundlePipeline", () => {
  it("test_tree_shaking_detects_used_imports_with_double_quotes", () => {
    const pipeline = new BundlePipeline()
    const bundleCode = 'import("react") and import("lodash")'
    const importmap: Importmap = {
      imports: {
        react: "https://cdn.esm.sh/react@18",
        lodash: "https://cdn.esm.sh/lodash@4",
        unused: "https://cdn.esm.sh/unused@1",
      },
    }

    const used = pipeline.validateTreeShaking(bundleCode, importmap)

    expect(used).toContain("react")
    expect(used).toContain("lodash")
    expect(used).not.toContain("unused")
  })

  it("test_tree_shaking_detects_single_quoted_imports", () => {
    const pipeline = new BundlePipeline()
    const bundleCode = "import('@vue/core') dynamic import"
    const importmap: Importmap = {
      imports: {
        "@vue/core": "https://cdn.esm.sh/vue@3",
      },
    }

    const used = pipeline.validateTreeShaking(bundleCode, importmap)

    expect(used).toContain("@vue/core")
  })

  it("test_inline_importmap_generates_valid_html_with_script_tags", () => {
    const pipeline = new BundlePipeline()
    const bundleCode = "console.log('Hello')"
    const importmap: Importmap = {
      imports: {
        app: "https://example.com/app.js",
      },
    }

    const result = pipeline.inlineImportmap(bundleCode, importmap)

    expect(result.html).toContain('<!DOCTYPE html>')
    expect(result.html).toContain('<script type="importmap">')
    expect(result.html).toContain('console.log')
    expect(result.html).toContain('"app":')
  })

  it("test_inline_importmap_size_equals_html_length", () => {
    const pipeline = new BundlePipeline()
    const bundleCode = "const x = 1"
    const importmap: Importmap = {
      imports: { test: "http://example.com/test.js" },
    }

    const result = pipeline.inlineImportmap(bundleCode, importmap)

    expect(result.size).toBe(result.html.length)
  })

  it("test_validate_importmap_rejects_invalid_structure", () => {
    const pipeline = new BundlePipeline()

    expect(pipeline.validateImportmap({ imports: null as any })).toBe(false)
    expect(pipeline.validateImportmap({ imports: { key: 123 } as any })).toBe(false)
    expect(
      pipeline.validateImportmap({
        imports: { valid: "http://example.com" },
      })
    ).toBe(true)
  })
})
