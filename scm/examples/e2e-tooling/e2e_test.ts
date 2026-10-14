import { describe, it, expect } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { createHash } from "node:crypto"
import { parseToml, generateCodeWithStrategies } from "../../../tooling/vite/scm/main/dist/saf/index.js"
import type { JustJSConfig } from "../../../tooling/vite/scm/main/dist/saf/index.js"
import { extractImportsFromCode, generateBundleResult } from "../../../tooling/build/scm/main/dist/saf/index.js"

const app = resolve(import.meta.dir, "../hello-justjs")
const config = parseToml(readFileSync(resolve(app, "justjs.config.toml"), "utf8")) as unknown as JustJSConfig
const manifest = JSON.parse(readFileSync(resolve(app, "public/justweb-artifacts.gen.json"), "utf8"))
const aliases = JSON.parse(readFileSync(resolve(app, "importmap.gen.json"), "utf8")).imports

describe("real example config -> codegen -> browser bundle", () => {
  it("accepts the example's multiline TOML and resolves real strategy packages", () => {
    const generated = generateCodeWithStrategies(config, new Map(Object.entries(aliases)), manifest)
    const imports = extractImportsFromCode(generated.code)
    expect(imports).toContain("@justjs/application")
    expect(imports).toContain("@justjs/aop-security")
    expect(imports.some(name => name.endsWith("-noop"))).toBe(false)
    const importmap = { imports: Object.fromEntries(imports.map(name => [name, `/vendor/${name.slice(1)}.js`])) }
    expect(generateBundleResult(generated.code, importmap).importsUsed).toEqual(imports)
    expect(() => generateBundleResult(generated.code, { imports: {} })).toThrow("not in importmap")
  })

  it("validates every pinned generated artifact against its manifest", () => {
    expect(manifest.artifacts.length).toBeGreaterThan(0)
    for (const artifact of manifest.artifacts) {
      const bytes = readFileSync(resolve(app, artifact.path))
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.sha256)
    }
  })

  it("bundles the real application without Vite alias configuration", async () => {
    const result = await Bun.build({ entrypoints: [resolve(app, "index.html")], target: "browser", format: "esm" })
    expect(result.success).toBe(true)
    const html = result.outputs.find(output => output.path.endsWith(".html"))!
    expect(await html.text()).toContain('type="module"')
    const scripts = result.outputs.filter(output => output.path.endsWith(".js"))
    expect(scripts.length).toBeGreaterThan(0)
    for (const script of scripts) {
      const code = await script.text()
      expect(extractImportsFromCode(code)).toEqual([])
      expect(code).not.toMatch(/\bBun\.(?:TOML|Transpiler|escapeHTML|Archive)\b/)
    }
  })
})
