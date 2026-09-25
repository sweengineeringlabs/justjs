import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createComponentRegistry, createLifecycle, createRouter, validateJustWebRuntimeMetadata } from "../saf/index.js"
import { SUPPORTED_JUSTWEB_GENERATOR_REVISION } from "../api/justweb_contract.js"

const examplesRoot = resolve(fileURLToPath(new URL("../../../../../scm/examples/", import.meta.url)))
const examples = ["hello-justjs", "cross-target-demo", "agentic-memory-demo", "ai-code-editor"]

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T
}

describe("freshly generated JustWeb example contracts", () => {
  for (const example of examples) {
    it(`${example} passes public JustJS factories using its generated output`, async () => {
      const root = resolve(examplesRoot, example)
      const [manifest, domAddressMap, routeOutput] = await Promise.all([
        readJson<any>(resolve(root, "public/justweb-artifacts.gen.json")),
        readJson<any>(resolve(root, "public/dom-address-map.json")),
        readJson<any>(resolve(root, "public/routes.gen.json")),
      ])
      const routes = routeOutput.routes.map((route: { path: string }) => route.path)
      const contract = await validateJustWebRuntimeMetadata({
        contract: {
          generatorVersion: manifest.generator.version,
          generatorRevision: manifest.generator.revision,
          artifactSchema: manifest.formatVersion,
        },
        manifest,
        domAddressMap,
        routes,
      })
      const components = createComponentRegistry(contract)
      const lifecycle = createLifecycle(contract, undefined, components)
      const routeRegistry = Object.fromEntries(routeOutput.routes.map((route: { path: string; tag: string; component: string; params?: Record<string, string> }) => [
        route.tag,
        { path: route.path, component: route.component, ...(route.params ? { params: route.params } : {}) },
      ]))

      expect(contract.manifest.generator.revision).toBe(SUPPORTED_JUSTWEB_GENERATOR_REVISION)
      expect(() => createRouter(routes, routeRegistry, lifecycle, contract)).not.toThrow()
      expect(components.list()).toEqual([])
    })
  }
})
