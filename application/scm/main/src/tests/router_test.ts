import { describe, it, expect } from "bun:test"
import { DefaultRouter } from "../core/router.js"

const manifest = {
  version: 1,
  routes: [
    { path: "/home",           componentId: "c1", featureId: "f1" },
    { path: "/items/:id",      componentId: "c2", featureId: "f2" },
  ]
}

describe("DefaultRouter", () => {
  it("test_resolve_returns_match_for_known_route", () => {
    const router = new DefaultRouter(manifest)
    const match  = router.resolve(new URL("https://app.example.com/home"))
    expect(match?.route.path).toBe("/home")
  })

  it("test_resolve_extracts_path_params", () => {
    const router = new DefaultRouter(manifest)
    const match  = router.resolve(new URL("https://app.example.com/items/42"))
    expect(match?.params["id"]).toBe("42")
  })

  it("test_resolve_returns_null_for_unknown_route", () => {
    const router = new DefaultRouter(manifest)
    expect(router.resolve(new URL("https://app.example.com/unknown"))).toBeNull()
  })

  it("test_current_signal_starts_null", () => {
    const router = new DefaultRouter(manifest)
    expect(router.current.value).toBeNull()
  })

  it("test_navigate_updates_current_signal", async () => {
    const router = new DefaultRouter(manifest)
    await router.navigate(new URL("https://app.example.com/home"))
    expect(router.current.value?.route.path).toBe("/home")
  })
})
