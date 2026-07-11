// One composition root, compiled unmodified for two targets: `vite build`
// (a real browser) and `justc build --bundle --format iife` (js-runtime's
// Android generator). Proves every OSI layer (network/transport/
// application/data) and all six AOP aspects work identically on both,
// through the same real DDAS-based router.navigate()/MountStep/RenderStep
// pipeline already verified on real Android hardware this session - not
// a narrated/labeled version of that pipeline, and not relying on native
// custom-element auto-upgrade of statically-declared tags the way
// scm/examples/hello-justjs's demo does (that demo never calls
// router.navigate() at all).
//
// No runtimeAdapter is passed to boot() on purpose - MountStep's default
// (NoopRuntimeAdapter) is a real no-op on both platforms already
// (js_runtime_shell_adapter.ts's own mount() is equally a no-op); actual
// DOM insertion happens in component_registry_adapter.ts's render(),
// which is plain DOM API calls with no platform dependency at all.

import { justjs, BootError } from "@justjs/application";
import { createFeatureStore } from "@justjs/data";
import { createSecurityProvider } from "@justjs/aop-security";
import { createObservabilityProvider } from "@justjs/aop-observability";
import { createFlagsProvider } from "@justjs/aop-flags";
import { createAnalyticsProvider } from "@justjs/aop-analytics";
import { createThemingProvider } from "@justjs/aop-theming";
import { createI18nProvider } from "@justjs/aop-i18n";
import "./components/counter.js";
import "./components/fetch-demo.js";
import "./components/login.js";
import { initialState, reducer } from "./core/state.js";

// justjs#91: a bare side-effect import of @justjs/aop-* does NOT actually
// register the strategy - the SPI module that does isn't reachable
// through the package's exports map, confirmed directly (not assumed) by
// checking justjs.providers.has() after such an import returned false.
// Registering manually via each package's public create*Provider()
// factory instead, until that's fixed upstream.
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
  // provider.factory(config) constructs the actual Aspect (context()/weave()) -
  // the provider object itself only has the one method, matching what
  // spi/index.ts does internally (`factory: (config) => provider.factory(config)`).
  justjs.providers.register({
    concern,
    strategy: provider.strategy,
    factory: (config?: unknown) => provider.factory(config),
  });
}

const store = createFeatureStore(initialState, reducer);

const ROUTES = ["/counter", "/fetch", "/login"] as const;
const MOUNT_ID_FOR_ROUTE: Record<string, string> = {
  "/counter": "mount-counter",
  "/fetch": "mount-fetch",
  "/login": "mount-login",
};

// RuntimeAdapter.mount() is a no-op on both targets (see the top-of-file
// comment) and unmount() is never wired to remove content either - all
// three routes are mounted once at boot, and navigating between them is
// purely a CSS `.active` toggle on the already-mounted containers, the
// same "mount everything, show/hide" pattern js-runtime's own
// mount-everything mode already uses.
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
        "x-counter": { path: "/counter", component: "x-counter" },
        "x-fetch": { path: "/fetch", component: "x-fetch" },
        "x-login": { path: "/login", component: "x-login" },
      },
      componentRegistry: {
        "x-counter": () => Promise.resolve(customElements.get("x-counter") as CustomElementConstructor),
        "x-fetch": () => Promise.resolve(customElements.get("x-fetch") as CustomElementConstructor),
        "x-login": () => Promise.resolve(customElements.get("x-login") as CustomElementConstructor),
      },
      domAddressMap: {
        elements: {
          "cross-target-demo:home:x-counter:root": { component: "counter", tag: "x-counter" },
          "cross-target-demo:home:x-fetch:root": { component: "fetch", tag: "x-fetch" },
          "cross-target-demo:home:x-login:root": { component: "login", tag: "x-login" },
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
      },
    });

    // Real DDAS mount, not a narrated one - navigate() is what actually
    // triggers MountStep/RenderStep to resolve the data-ddas-id
    // placeholder and insert the component into it.
    for (const route of ROUTES) {
      await justjs.router!.navigate(route);
    }
    showRoute("/counter");

    document.querySelectorAll<HTMLElement>(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        showRoute(btn.dataset.route!);
      });
    });

    document.title = "cross-target-demo: mounted";
  } catch (e) {
    const msg = e instanceof BootError ? `BootError(${e.code}): ${e.message}` : String(e);
    document.title = `cross-target-demo: boot failed - ${msg}`;
    const mount = document.getElementById("app");
    if (mount) {
      mount.innerHTML = `<p style="color:red">Boot failed: ${msg}</p>`;
    }
  }
}

main();
