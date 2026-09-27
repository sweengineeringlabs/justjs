import { describe, expect, it } from "bun:test"
import { BootError } from "../api/boot.js"
import { adaptCustomElementRegistry, createComponentRegistry, createLifecycle, createRouter, validateJustWebRuntimeMetadata } from "../saf/index.js"
import { SUPPORTED_JUSTWEB_GENERATOR_REVISION } from "../api/justweb_contract.js"

const lifecycle = { run: async () => {}, rerender: async () => {}, unmount: async () => {} } as any

async function validatedContract(tags: string[], routes: string[] = ["/"]) {
  const domAddressMap = { elements: Object.fromEntries(tags.map((tag) => [`app:home:${tag}:root`, { component: tag, tag }])) }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(domAddressMap, null, 2)))
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  return validateJustWebRuntimeMetadata({
    contract: { generatorVersion: "0.1.0", generatorRevision: SUPPORTED_JUSTWEB_GENERATOR_REVISION, artifactSchema: 1 },
    manifest: {
      format: "justweb-artifact-manifest", formatVersion: 1,
      generator: { name: "justw", version: "0.1.0", revision: SUPPORTED_JUSTWEB_GENERATOR_REVISION, sourceDirty: false },
      artifacts: [
        { path: "public/dom-address-map.json", sha256 },
        { path: "src/registry.gen.ts", sha256: "0".repeat(64) },
        { path: "src/component-registry.gen.ts", sha256: "0".repeat(64) },
        { path: "public/routes.gen.json", sha256: "0".repeat(64) },
        { path: "src/routes.gen.ts", sha256: "0".repeat(64) },
      ],
    },
    domAddressMap,
    routes,
  })
}

describe("mandatory JustWeb public entry points", () => {
  it("requires validated contract metadata when creating a mutable component registry", async () => {
    expect(() => createComponentRegistry(undefined as any)).toThrow(/validated JustWeb contract/)
    const registry = createComponentRegistry(await validatedContract(["x-root"]))
    registry.register("x-root", () => ({ name: "root", render() {} }))
    expect(() => registry.register("x-root", () => ({ name: "replacement", render() {} })))
      .toThrow(/already registered under the JustWeb contract/)
    expect(() => registry.register("x-forged", () => ({ name: "forged", render() {} })))
      .toThrow(/not declared by the JustWeb dom-address-map/)
  })

  it("rejects fabricated capabilities in every public factory", () => {
    const fabricated = { domAddressMap: { elements: {} } }
    expect(() => createComponentRegistry(fabricated as any)).toThrow(/validated JustWeb contract/)
    expect(() => createLifecycle(fabricated as any)).toThrow(/validated JustWeb contract/)
    expect(() => createRouter(["/"], {}, lifecycle, fabricated as any)).toThrow(/validated JustWeb contract/)
    expect(() => adaptCustomElementRegistry({}, fabricated as any)).toThrow(/validated JustWeb contract/)
  })

  it("rejects a router without a validated contract", () => {
    expect(() => createRouter(["/"], { "x-root": { path: "/", component: "Root" } }, lifecycle, undefined as any))
      .toThrow(/validated JustWeb contract/)
  })

  it("rejects registry tags absent from the validated DDAS map", async () => {
    const contract = await validatedContract(["x-other"])
    expect(() => createRouter(
      ["/"],
      { "x-root": { path: "/", component: "Root" } },
      lifecycle,
      contract,
    )).toThrow(BootError)
  })

  it("accepts only registry tags represented by DDAS", async () => {
    const contract = await validatedContract(["x-root"])
    expect(() => createRouter(
      ["/"],
      { "x-root": { path: "/", component: "Root" } },
      lifecycle,
      contract,
    )).not.toThrow()
    expect(() => createRouter(
      ["/forged"],
      { "x-root": { path: "/forged", component: "Root" } },
      lifecycle,
      contract,
    )).toThrow(/exactly match the route list validated from JustWeb metadata/)
  })

  it("rejects mounting a different custom element under a declared component tag", async () => {
    const contract = await validatedContract(["x-root"])
    const lifecycle = createLifecycle(contract)
    await expect(lifecycle.run({
      tag: "x-root",
      props: {},
      element: { tagName: "x-forged" } as Element,
    })).rejects.toThrow(/does not match declared JustWeb component tag/)
  })
})
