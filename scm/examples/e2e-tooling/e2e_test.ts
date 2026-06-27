import { describe, it, expect } from "bun:test"
import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"

// Import the three tools
import {
  generateCodeWithStrategies,
  readAvailableStrategies,
} from "../tooling/vite/scm/main/dist/saf/index.js"
import {
  renderComponent,
  renderDeclarativeShadowDom,
} from "../tooling/ssr/scm/main/dist/saf/index.js"
import {
  inlineImportmap,
  validateTreeShaking,
} from "../tooling/build/scm/main/dist/saf/index.js"
import type { ComponentDefinition, ComponentProps } from "../tooling/ssr/scm/main/dist/saf/index.js"

const E2E_DIR = resolve(import.meta.dir, "../e2e-demo")

describe("e2e: config + ssr + build", () => {
  it("test_e2e_config_codegen_reads_real_toml", () => {
    const configPath = resolve(E2E_DIR, "justjs.config.toml")
    const configContent = readFileSync(configPath, "utf-8")

    expect(configContent).toContain("[security]")
    expect(configContent).toContain("strategy = \"oauth\"")
    expect(configContent).toContain("strategy = \"datadog\"")
  })

  it("test_e2e_importmap_has_all_strategies", () => {
    const importmapPath = resolve(E2E_DIR, "importmap.gen.json")
    const importmapContent = readFileSync(importmapPath, "utf-8")
    const importmap = JSON.parse(importmapContent)

    expect(importmap.imports["@justjs/aop-security-oauth"]).toBeDefined()
    expect(importmap.imports["@justjs/aop-observability-datadog"]).toBeDefined()
    expect(importmap.imports["@justjs/aop-flags-launchdarkly"]).toBeDefined()
  })

  it("test_e2e_routes_defines_valid_paths", () => {
    const routesPath = resolve(E2E_DIR, "routes.gen.json")
    const routesContent = readFileSync(routesPath, "utf-8")
    const routes = JSON.parse(routesContent)

    expect(routes.routes).toContain("/dashboard")
    expect(routes.routes).toContain("/account")
  })

  it("test_e2e_ssr_renders_button_to_html", () => {
    const mockButton: ComponentDefinition = {
      renderShadowDom(props: ComponentProps) {
        const label = props.label ?? "Click me"
        return `<button>${String(label)}</button>`
      },
    }

    const result = renderComponent("x-button", mockButton, { label: "Sign In" })

    expect(result.html).toContain("<x-button>")
    expect(result.html).toContain("<button>Sign In</button>")
    expect(result.html).toContain('shadowrootmode="open"')
  })

  it("test_e2e_build_pipeline_validates_importmap", () => {
    const importmapPath = resolve(E2E_DIR, "importmap.gen.json")
    const importmapContent = readFileSync(importmapPath, "utf-8")
    const importmap = JSON.parse(importmapContent)

    const bundleCode = `
import { boot } from "@justjs/core"
import security from "@justjs/aop-security-oauth"
import observability from "@justjs/aop-observability-datadog"

export async function start() {
  await boot()
}
`

    expect(() =>
      validateTreeShaking(bundleCode, importmap)
    ).not.toThrow()
  })

  it("test_e2e_inline_importmap_generates_html", () => {
    const importmapPath = resolve(E2E_DIR, "importmap.gen.json")
    const importmapContent = readFileSync(importmapPath, "utf-8")
    const importmap = JSON.parse(importmapContent)

    const bundleCode = `
import { boot } from "@justjs/core"
boot()
`

    const result = inlineImportmap(bundleCode, importmap)

    expect(result.html).toContain("<!DOCTYPE html>")
    expect(result.html).toContain('<script type="importmap">')
    expect(result.html).toContain("@justjs/core")
    expect(result.html).toContain("/vendor/core-v0.1.0.js")
    expect(result.html).toContain("<script>")
    expect(result.html).toContain("boot()")
  })

  it("test_e2e_full_pipeline_integration", () => {
    // 1. Read real importmap
    const importmapPath = resolve(E2E_DIR, "importmap.gen.json")
    const importmapContent = readFileSync(importmapPath, "utf-8")
    const importmap = JSON.parse(importmapContent)

    // 2. Create bundle code with all configured strategies
    const bundleCode = `
import { boot } from "@justjs/core"
import "@justjs/aop-security-oauth"
import "@justjs/aop-observability-datadog"
import "@justjs/aop-flags-launchdarkly"

async function init() {
  await boot()
}

init()
`

    // 3. Validate tree-shaking (all imports must be in importmap)
    const usedImports = validateTreeShaking(bundleCode, importmap)
    expect(usedImports).toContain("@justjs/core")
    expect(usedImports).toContain("@justjs/aop-security-oauth")

    // 4. Inline importmap into HTML
    const { html } = inlineImportmap(bundleCode, importmap)

    // 5. Verify output is valid HTML
    expect(html).toContain("<!DOCTYPE html>")
    expect(html).toContain("<html>")
    expect(html).toContain("</html>")
    expect(html).toContain('<script type="importmap">')
    expect(html).toContain("<script>")
    expect(html).toContain("init()")

    // 6. Render component with SSR
    const mockCard: ComponentDefinition = {
      renderShadowDom(props: ComponentProps) {
        const title = props.title ?? "Dashboard"
        return `<div class="dashboard-card"><h1>${String(title)}</h1><slot></slot></div>`
      },
    }

    const cardHtml = renderComponent("x-dashboard", mockCard, { title: "Welcome" })
    expect(cardHtml.html).toContain("<h1>Welcome</h1>")
    expect(cardHtml.html).toContain('shadowrootmode="open"')

    // 7. Combine into final HTML
    const finalHtml = html.replace(
      "<div id=\"app\"></div>",
      `<div id="app">${cardHtml.html}</div>`
    )

    // 8. Verify it's all there
    expect(finalHtml).toContain("<!DOCTYPE html>")
    expect(finalHtml).toContain("@justjs/core")
    expect(finalHtml).toContain("<x-dashboard>")
    expect(finalHtml).toContain("<h1>Welcome</h1>")

    // Save for inspection
    writeFileSync(resolve(E2E_DIR, "output.html"), finalHtml)
  })
})
