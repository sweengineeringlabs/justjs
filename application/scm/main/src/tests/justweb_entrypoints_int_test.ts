import { describe, expect, it } from "bun:test"
import { BootError } from "../api/boot.js"
import { createComponentRegistry, createRouter } from "../saf/index.js"

const lifecycle = { run: async () => {}, rerender: async () => {}, unmount: async () => {} } as any

describe("mandatory JustWeb public entry points", () => {
  it("requires DDAS when creating a mutable component registry", () => {
    expect(() => createComponentRegistry(undefined as any)).toThrow(BootError)
    const registry = createComponentRegistry({ elements: { "app:home:x-root:root": { component: "Root", tag: "x-root" } } })
    expect(() => registry.register("x-forged", () => ({ name: "forged", render() {} })))
      .toThrow(/not declared by the JustWeb dom-address-map/)
  })

  it("rejects a router with no DDAS map", () => {
    expect(() => createRouter(["/"], { "x-root": { path: "/", component: "Root" } }, lifecycle, undefined as any))
      .toThrow(BootError)
  })

  it("rejects registry tags absent from the validated DDAS map", () => {
    expect(() => createRouter(
      ["/"],
      { "x-root": { path: "/", component: "Root" } },
      lifecycle,
      { elements: { "app:home:x-other:root": { component: "Other", tag: "x-other" } } },
    )).toThrow(BootError)
  })

  it("accepts only registry tags represented by DDAS", () => {
    expect(() => createRouter(
      ["/"],
      { "x-root": { path: "/", component: "Root" } },
      lifecycle,
      { elements: { "app:home:x-root:root": { component: "Root", tag: "x-root" } } },
    )).not.toThrow()
  })
})
