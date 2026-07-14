// One composition root, compiled unmodified for two targets: `vite build`
// (a real browser) and `justc build --bundle --format iife` (js-runtime's
// Android generator) - same pattern scm/examples/agentic-memory-demo and
// cross-target-demo already proved. Demonstrates @justjs/ai-assist's real
// Anthropic-backed provider across five views sharing one FeatureStore: a
// code editor (with a nested-folder file explorer sidebar, button-
// triggered completion, and structured review), an AI chat surface, a
// review-findings list, a from-scratch single-file/multi-file-project
// scaffolder, and an SDLC workspace hub linking each stage to whichever
// of those tabs actually serves it.

import { justjs, BootError } from "@justjs/application";
import { createFeatureStore } from "@justjs/data";
import { stampMounts } from "./mounts.gen.js";
import { createSecurityProvider } from "@justjs/aop-security";
import { createObservabilityProvider } from "@justjs/aop-observability";
import { createFlagsProvider } from "@justjs/aop-flags";
import { createAnalyticsProvider } from "@justjs/aop-analytics";
import { createThemingProvider } from "@justjs/aop-theming";
import { createI18nProvider } from "@justjs/aop-i18n";
import "./components/editor.js";
import "./components/chat.js";
import "./components/review.js";
import "./components/scaffold.js";
import "./components/workspace.js";
import "./components/communication.js";
import "./components/socials.js";
import { loadInitialState, persistProject, reducer } from "./core/state.js";
import { applyStoredTheme, currentTheme, toggleTheme } from "./core/theme.js";
import { getStoredApiKey, setStoredApiKey } from "./core/ai_assist.js";
import { NAVIGATE_EVENT } from "./core/navigation.js";
import type { NavigateEventDetail } from "./core/navigation.js";

// Applied before boot (not inside main()'s try block) so a stored
// override takes effect on the very first paint.
applyStoredTheme();

// justjs#91: a bare side-effect import of @justjs/aop-* does NOT actually
// register the strategy - the SPI module that does isn't reachable
// through the package's exports map. Registering manually via each
// package's public create*Provider() factory instead, same workaround as
// agentic-memory-demo/src/app.ts (first applied in cross-target-demo).
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

const store = createFeatureStore(loadInitialState(), reducer);

const PERSIST_DEBOUNCE_MS = 400;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
// One blanket subscription (not scattered persistProject() calls across
// every mutating action site in 4+ components, easy to forget in some
// future one) - but debounced, since editor.ts's content-edit path
// dispatches SET_ACTIVE_FILE_CONTENT on every keystroke and
// DefaultFeatureStore has no batching. Undebounced, this would
// JSON.stringify() the whole project and hit localStorage.setItem() on
// every single keystroke - the same class of per-keystroke blocking work
// this app already avoided elsewhere (live-as-you-type completion was
// rejected for the same reason). Up to ~400ms of loss on an abrupt close
// is an accepted tradeoff for a demo app.
store.subscribe(() => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persistProject(store.state.value), PERSIST_DEBOUNCE_MS);
});

// Real generated DDAS/route data (justweb#69/#70/#71, justjs#95) replaces
// what used to be hand-typed ROUTES/MOUNT_ID_FOR_ROUTE/registry/
// domAddressMap literals. Fetched at runtime, not statically imported -
// both files live under public/, and Vite's dev server (unlike its
// production `vite build`, which happily inlines them) refuses to
// resolve a JS `import` of anything under public/ ("Assets in public
// directory cannot be imported from JavaScript"), silently breaking
// `bun run dev` while `bun run build` looked fine. fetch() is Vite's own
// documented way to consume public/ files, and works identically in dev
// and build. routes.gen.json's own `tag` field is unusable here - it's
// always auto-derived as "js-<component>" (justweb's
// component_tag_name), never matching this app's real x-editor/x-chat/
// ... tags - so the real tag comes from dom-address-map.json's
// bound-mount `elements` entries instead (justweb.toml's
// [mounts.*].tag), joined by the shared bare component name. Any route
// whose component has no bound mount fails loud rather than silently
// mounting nothing.
interface ResolvedRoute {
  readonly path: string;
  readonly tag: string;
  readonly mountElementId: string;
}

type DomAddressElements = Record<string, { component: string; tag?: string }>;

async function resolveGeneratedRoutes(): Promise<{ routes: ResolvedRoute[]; elements: DomAddressElements }> {
  const [domAddressMapJson, routesGenJson] = await Promise.all([
    fetch("/dom-address-map.json").then((r) => r.json()),
    fetch("/routes.gen.json").then((r) => r.json()),
  ]);
  const elements = domAddressMapJson.elements as DomAddressElements;
  const mounts = domAddressMapJson.mounts as Record<string, { id: string; selector: string }>;
  const routes = routesGenJson.routes as Array<{ path: string; component: string }>;

  const resolved = routes.map((route) => {
    const elementEntry = Object.entries(elements).find(([, el]) => el.component === route.component);
    if (!elementEntry || !elementEntry[1].tag) {
      throw new Error(
        `ai-code-editor: no bound [mounts] entry for route component "${route.component}" (path ${route.path}) - check justweb.toml's [mounts.*].tag.`,
      );
    }
    const [ddasId, element] = elementEntry;
    const mount = Object.values(mounts).find((m) => m.id === ddasId);
    if (!mount) {
      throw new Error(`ai-code-editor: no [mounts] entry resolves to DDAS id "${ddasId}".`);
    }
    return { path: route.path, tag: element.tag!, mountElementId: mount.selector.replace(/^#/, "") };
  });

  return { routes: resolved, elements };
}

// Populated by main() before boot() runs - showRoute()/goToRoute() are
// only ever invoked (via the NAVIGATE_EVENT listener or a nav-bar click)
// after main() has awaited resolveGeneratedRoutes() and boot() has
// mounted every route, so these are never read empty.
let RESOLVED_ROUTES: ResolvedRoute[] = [];
let ROUTES: string[] = [];
let MOUNT_ID_FOR_ROUTE: Record<string, string> = {};
let DOM_ADDRESS_ELEMENTS: DomAddressElements = {};

// Pure visual concern - which mount container is displayed. Router has no
// notion of this at all (DefaultRouter.navigate() only ever touches the
// container of the route being navigated *to*, never hides any other), so
// this stays separate from goToRoute() below rather than folded into it.
function showRoute(path: string): void {
  for (const [route, mountId] of Object.entries(MOUNT_ID_FOR_ROUTE)) {
    document.getElementById(mountId)?.classList.toggle("active", route === path);
  }
  document.querySelectorAll<HTMLElement>(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === path);
  });
}

// Every real navigation (nav-bar tap, or a component's own navigateTo()
// call) goes through the real justjs.router.navigate() - not just the one
// boot-time pass over ROUTES. Previously this app called navigate() once
// per route at boot only, then relied purely on showRoute()'s CSS toggle
// for every navigation after that - leaving Router.currentPath() stuck on
// whichever route was last in that boot loop, and ADR-0004's reactive
// re-render subscription wired to that same stale route instead of
// whichever tab the user actually has open. Calling navigate() for real
// here does not lose any component state: each route resolves to its own
// distinct DDAS container, and adaptCustomElementRegistry()'s render()
// reuses the existing custom-element instance (container.firstElementChild
// instanceof ElementCtor) rather than recreating it - RuntimeAdapter.mount()
// being a no-op on both targets (same finding as cross-target-demo/
// agentic-memory-demo) means nothing here is destructive.
function goToRoute(path: string): void {
  justjs.router!.navigate(path)
    .then(() => showRoute(path))
    .catch((error: unknown) => console.error(`Error navigating to "${path}":`, error));
}

// Lets editor.ts/review.ts/scaffold.ts trigger a tab switch (e.g. Review
// jumping back to Editor on a finding click, Scaffold's "Insert into
// editor") without importing this module back - see core/navigation.ts.
document.addEventListener(NAVIGATE_EVENT, (e) => {
  goToRoute((e as CustomEvent<NavigateEventDetail>).detail.route);
});

function updateThemeToggleIcon(): void {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) {
    return;
  }
  btn.textContent = currentTheme() === "dark" ? "☀️" : "🌙";
}

function setupThemeToggle(): void {
  const btn = document.getElementById("theme-toggle-btn");
  updateThemeToggleIcon();
  btn?.addEventListener("click", () => {
    toggleTheme();
    updateThemeToggleIcon();
  });
}

// The only field this app's settings sheet needs is the Anthropic API
// key - stored in localStorage only, disclosed in-product (not just in a
// README) since this whole example series has no backend to proxy the
// call through. Anthropic's Messages API blocks direct-browser calls by
// default specifically because this pattern (a key visible in every
// request, inspectable by anyone with devtools open on this page) is
// discouraged outside personal/local tools - accepted here as a
// demo-scoped, understood tradeoff, not an oversight.
function setupSettingsPanel(): void {
  const panel = document.getElementById("settings-panel");
  const openBtn = document.getElementById("settings-btn");
  const closeBtn = document.getElementById("settings-close-btn");
  const backdrop = document.getElementById("settings-backdrop");
  const apiKeyInput = document.getElementById("settings-api-key") as HTMLInputElement | null;
  const saveBtn = document.getElementById("settings-api-key-save");
  const clearBtn = document.getElementById("settings-api-key-clear");
  const statusEl = document.getElementById("settings-api-key-status");

  function renderKeyStatus(): void {
    if (!statusEl) {
      return;
    }
    const hasKey = getStoredApiKey().length > 0;
    statusEl.textContent = hasKey ? "✓ API key saved on this device" : "No API key set - AI features are disabled";
  }

  const open = () => {
    if (apiKeyInput) {
      apiKeyInput.value = getStoredApiKey();
    }
    renderKeyStatus();
    panel?.removeAttribute("hidden");
  };
  const close = () => panel?.setAttribute("hidden", "");
  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);

  saveBtn?.addEventListener("click", () => {
    setStoredApiKey(apiKeyInput?.value.trim() ?? "");
    renderKeyStatus();
  });
  clearBtn?.addEventListener("click", () => {
    if (apiKeyInput) {
      apiKeyInput.value = "";
    }
    setStoredApiKey("");
    renderKeyStatus();
  });
}

async function main(): Promise<void> {
  try {
    const { routes, elements } = await resolveGeneratedRoutes();
    RESOLVED_ROUTES = routes;
    ROUTES = routes.map((r) => r.path);
    MOUNT_ID_FOR_ROUTE = Object.fromEntries(routes.map((r) => [r.path, r.mountElementId]));
    DOM_ADDRESS_ELEMENTS = elements;

    // Stamps each real generated DDAS id (justweb.toml's [mounts]) onto
    // its container before boot, so MountStep's first resolveDdasAddressesForTag()
    // lookup finds a live element - matches justweb's own intended
    // stampMounts()-before-boot usage (cli_e2e_mounts_test.rs).
    stampMounts();

    await justjs.boot({
      routes: [...ROUTES],
      registry: Object.fromEntries(
        RESOLVED_ROUTES.map((r) => [r.tag, { path: r.path, component: r.tag }]),
      ),
      componentRegistry: Object.fromEntries(
        RESOLVED_ROUTES.map((r) => [
          r.tag,
          () => Promise.resolve(customElements.get(r.tag) as CustomElementConstructor),
        ]),
      ),
      domAddressMap: {
        elements: DOM_ADDRESS_ELEMENTS,
      },
      featureStore: store,
      aspects: {
        security: { strategy: "noop" },
        observability: { strategy: "noop" },
        flags: { strategy: "noop" },
        analytics: { strategy: "noop" },
        theming: { strategy: "noop" },
        i18n: { strategy: "noop" },
        // "aiAssist" deliberately NOT listed here - boot() can now forward
        // aspects[concern].config to the strategy's factory() for real
        // (application/scm/main/src/core/boot.ts), so this isn't a hard
        // blocker anymore. It's still built directly via
        // createAiAssistProvider(config) in core/ai_assist.ts because the
        // key is loaded from localStorage after boot, not known at boot
        // time - boot()'s aspects config has no path for a value that
        // only exists once the app is already running.
      },
    });

    for (const route of ROUTES) {
      await justjs.router!.navigate(route);
    }
    goToRoute("/editor");

    document.querySelectorAll<HTMLElement>(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        goToRoute(btn.dataset.route!);
      });
    });

    setupThemeToggle();
    setupSettingsPanel();

    document.title = "ai-code-editor: mounted";
  } catch (e) {
    const msg = e instanceof BootError ? `BootError(${e.code}): ${e.message}` : String(e);
    document.title = `ai-code-editor: boot failed - ${msg}`;
    const mount = document.getElementById("app");
    if (mount) {
      mount.innerHTML = `<p style="color:red">Boot failed: ${msg}</p>`;
    }
  }
}

main();
