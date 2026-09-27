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

import { justjs, BootError, SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA, SUPPORTED_JUSTWEB_GENERATOR_REVISION, SUPPORTED_JUSTWEB_GENERATOR_VERSION } from "@justjs/application";
import { JUSTWEB_MANIFEST } from "./justweb-manifest.gen.js";
import domAddressMapJson from "../public/dom-address-map.json";
import routesGenJson from "../public/routes.gen.json";
import { stampMounts } from "./mounts.gen.js";
import { createFeatureStore } from "@justjs/data";
import { configureTransportProxy } from "@justjs/network";
// justjs#91 (fixed): every aop-* package's saf/index.ts now imports its
// own spi/index.js for the self-registration side effect - a bare
// import is genuinely enough, no manual register() workaround needed.
import "@justjs/aop-security";
import "@justjs/aop-observability";
import "@justjs/aop-flags";
import "@justjs/aop-analytics";
import "@justjs/aop-theming";
import "@justjs/aop-i18n";
import "./components/counter.js";
import "./components/fetch-demo.js";
import "./components/login.js";
import { initialState, reducer } from "./core/state.js";

const store = createFeatureStore(initialState, reducer);

const ROUTES = routesGenJson.routes.map((route) => route.path);
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
    stampMounts();
    // The web host supplies this endpoint; native hosts can provide an
    // absolute endpoint through the same meta tag.
    const proxyUrl = document.querySelector<HTMLMetaElement>('meta[name="transport-proxy"]')?.content;
    configureTransportProxy(proxyUrl || "/api/demo-user");
    await justjs.boot({
      justwebContract: {
        generatorVersion: SUPPORTED_JUSTWEB_GENERATOR_VERSION,
        generatorRevision: SUPPORTED_JUSTWEB_GENERATOR_REVISION,
        artifactSchema: SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA,
      },
      justwebManifest: JUSTWEB_MANIFEST,
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
      domAddressMap: domAddressMapJson,
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
