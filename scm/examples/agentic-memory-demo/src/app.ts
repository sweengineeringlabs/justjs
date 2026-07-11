// One composition root, compiled unmodified for two targets: `vite build`
// (a real browser) and `justc build --bundle --format iife` (js-runtime's
// Android generator) - same pattern scm/examples/cross-target-demo
// already proved. Demonstrates @justjs/memory's pluggable "dummy"
// provider across three real views sharing one FeatureStore and one
// MemoryProvider instance (src/core/memory.ts): a chat surface that
// recalls prior memories, a dashboard for humans to inspect/edit/delete
// them, and an agent-curation view that consolidates/forgets on demand
// with its reasoning visible.

import { justjs, BootError } from "@justjs/application";
import { createFeatureStore } from "@justjs/data";
import { createSecurityProvider } from "@justjs/aop-security";
import { createObservabilityProvider } from "@justjs/aop-observability";
import { createFlagsProvider } from "@justjs/aop-flags";
import { createAnalyticsProvider } from "@justjs/aop-analytics";
import { createThemingProvider } from "@justjs/aop-theming";
import { createI18nProvider } from "@justjs/aop-i18n";
// @justjs/memory's own saf/index.ts imports its spi/index.ts for this
// side effect (justjs#91 fixed in this package, not repeated) - a bare
// import is genuinely enough to self-register the "dummy" strategy,
// unlike the six aop-* packages below.
import "@justjs/memory";
import "./components/chat.js";
import "./components/dashboard.js";
import "./components/curation.js";
import { initialState, reducer, getOrCreateDeviceUserId } from "./core/state.js";

// justjs#91: a bare side-effect import of @justjs/aop-* does NOT actually
// register the strategy - the SPI module that does isn't reachable
// through the package's exports map, confirmed directly (not assumed) by
// checking justjs.providers.has() after such an import returned false.
// Registering manually via each package's public create*Provider()
// factory instead, until that's fixed upstream (see cross-target-demo's
// app.ts for the same workaround, first applied there).
const aspectFactories = {
  security: createSecurityProvider,
  observability: createObservabilityProvider,
  flags: createFlagsProvider,
  analytics: createAnalyticsProvider,
  theming: createThemingProvider,
  i18n: createI18nProvider,
} as const;
for (const [concern, factory] of Object.entries(aspectFactories)) {
  const provider = factory();
  justjs.providers.register({
    concern,
    strategy: provider.strategy,
    factory: (config?: unknown) => provider.factory(config),
  });
}

const store = createFeatureStore(
  { ...initialState, userId: getOrCreateDeviceUserId() },
  reducer
);

const ROUTES = ["/chat", "/dashboard", "/curation"] as const;
const MOUNT_ID_FOR_ROUTE: Record<string, string> = {
  "/chat": "mount-chat",
  "/dashboard": "mount-dashboard",
  "/curation": "mount-curation",
};

// RuntimeAdapter.mount() is a no-op on both targets (same finding as
// cross-target-demo) and unmount() is never wired to remove content
// either - all three routes are mounted once at boot, and navigating
// between them is purely a CSS `.active` toggle on the already-mounted
// containers.
function showRoute(path: string): void {
  for (const [route, mountId] of Object.entries(MOUNT_ID_FOR_ROUTE)) {
    document.getElementById(mountId)?.classList.toggle("active", route === path);
  }
  document.querySelectorAll<HTMLElement>(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === path);
  });
}

async function main(): Promise<void> {
  try {
    await justjs.boot({
      routes: [...ROUTES],
      registry: {
        "x-chat": { path: "/chat", component: "x-chat" },
        "x-dashboard": { path: "/dashboard", component: "x-dashboard" },
        "x-curation": { path: "/curation", component: "x-curation" },
      },
      componentRegistry: {
        "x-chat": () => Promise.resolve(customElements.get("x-chat") as CustomElementConstructor),
        "x-dashboard": () => Promise.resolve(customElements.get("x-dashboard") as CustomElementConstructor),
        "x-curation": () => Promise.resolve(customElements.get("x-curation") as CustomElementConstructor),
      },
      domAddressMap: {
        elements: {
          "agentic-memory-demo:home:x-chat:root": { component: "chat", tag: "x-chat" },
          "agentic-memory-demo:home:x-dashboard:root": { component: "dashboard", tag: "x-dashboard" },
          "agentic-memory-demo:home:x-curation:root": { component: "curation", tag: "x-curation" },
        },
      },
      featureStore: store,
      aspects: {
        security: { strategy: "noop" },
        observability: { strategy: "noop" },
        flags: { strategy: "noop" },
        analytics: { strategy: "noop" },
        theming: { strategy: "noop" },
        i18n: { strategy: "noop" },
        memory: { strategy: "dummy" },
      },
    });

    for (const route of ROUTES) {
      await justjs.router!.navigate(route);
    }
    showRoute("/chat");

    document.querySelectorAll<HTMLElement>(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        showRoute(btn.dataset.route!);
      });
    });

    document.title = "agentic-memory-demo: mounted";
  } catch (e) {
    const msg = e instanceof BootError ? `BootError(${e.code}): ${e.message}` : String(e);
    document.title = `agentic-memory-demo: boot failed - ${msg}`;
    const mount = document.getElementById("app");
    if (mount) {
      mount.innerHTML = `<p style="color:red">Boot failed: ${msg}</p>`;
    }
  }
}

main();
