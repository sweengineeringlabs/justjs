import { describe, it, expect, beforeAll, afterEach } from "bun:test";
import { Window } from "happy-dom";

// bun test has no real localStorage (see memory package's own int test) -
// happy-dom (already an established devDependency pattern in this
// monorepo) provides one. Copied onto globalThis only when not already
// present, matching this monorepo's own established shimming convention.
//
// saf/index.js now also self-registers <control-provider-connector>
// (justjs#101) as an import side effect, which extends HTMLElement at
// module-eval time - so createCredentialStore has to be reached via a
// dynamic import *after* the DOM shim runs, same as every
// component-view test already does, not a static import (which bun
// hoists above this file's own shim code, same as any ES module).
const win = new Window();
for (const key of ["customElements", "HTMLElement", "document", "ShadowRoot", "Node"] as const) {
  if (!(key in globalThis)) {
    (globalThis as Record<string, unknown>)[key] = (win as unknown as Record<string, unknown>)[key];
  }
}
if (!("localStorage" in globalThis)) {
  (globalThis as Record<string, unknown>).localStorage = win.localStorage;
}

let createCredentialStore: typeof import("../saf/index.js").createCredentialStore;

beforeAll(async () => {
  ({ createCredentialStore } = await import("../saf/index.js"));
});

afterEach(() => {
  globalThis.localStorage.clear();
});

describe("createCredentialStore", () => {
  it("returns an empty string for a provider with nothing stored yet", () => {
    const store = createCredentialStore("cartoon");
    expect(store.get("openai")).toBe("");
  });

  it("returns the token that was just set for that provider", () => {
    const store = createCredentialStore("cartoon");
    store.set("openai", "sk-abc123");
    expect(store.get("openai")).toBe("sk-abc123");
  });

  it("removes the key instead of storing an empty string", () => {
    const store = createCredentialStore("cartoon");
    store.set("openai", "sk-abc123");
    store.set("openai", "");
    expect(globalThis.localStorage.getItem("justjs:ai-editor:cartoon-token:openai")).toBeNull();
    expect(store.get("openai")).toBe("");
  });

  it("namespaces keys so two stores don't collide on the same providerId", () => {
    const cartoon = createCredentialStore("cartoon");
    const pm = createCredentialStore("pm");
    cartoon.set("openai", "cartoon-token");
    pm.set("openai", "pm-token");
    expect(cartoon.get("openai")).toBe("cartoon-token");
    expect(pm.get("openai")).toBe("pm-token");
  });

  it("degrades to a no-op get/set when localStorage throws", () => {
    const throwing: Storage = {
      getItem() {
        throw new Error("storage disabled");
      },
      setItem() {
        throw new Error("storage disabled");
      },
      removeItem() {
        throw new Error("storage disabled");
      },
      clear() {},
      key() {
        return null;
      },
      length: 0,
    };
    const original = globalThis.localStorage;
    (globalThis as Record<string, unknown>).localStorage = throwing;
    try {
      const store = createCredentialStore("cartoon");
      expect(store.get("openai")).toBe("");
      expect(() => store.set("openai", "sk-abc123")).not.toThrow();
    } finally {
      (globalThis as Record<string, unknown>).localStorage = original;
    }
  });
});
