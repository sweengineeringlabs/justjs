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
// justjs#91 (fixed): each aop-* package's saf/index.ts now imports its
// own spi/index.js for the self-registration side effect, so a bare
// import is genuinely enough - no manual createXProvider()/register()
// workaround needed anymore.
import "@justjs/aop-security";
import "@justjs/aop-observability";
import "@justjs/aop-flags";
import "@justjs/aop-analytics";
import "@justjs/aop-theming";
import "@justjs/aop-i18n";
import "./components/home.js";
import "./components/editor.js";
import "./components/chat.js";
import "./components/review.js";
import "./components/scaffold.js";
import "./components/connect.js";
import { loadInitialState, persistProject, reducer } from "./core/state.js";
import { applyStoredTheme, currentTheme, setTheme, toggleTheme, THEMES } from "./core/theme.js";
import type { Theme } from "./core/theme.js";
import { getStoredApiKey, setStoredApiKey } from "./core/ai_assist.js";
import { completeJiraOAuthCallback } from "./core/pm_connect.js";
import { NAVIGATE_EVENT } from "./core/navigation.js";
import type { NavigateEventDetail } from "./core/navigation.js";

// Applied before boot (not inside main()'s try block) so a stored
// override takes effect on the very first paint.
applyStoredTheme();

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
// domAddressMap literals. Statically imported (not fetched at runtime -
// see justscript_compiler#22, fixed 2026-07-22) so both compiled
// targets (`vite build` and `justc build --bundle --format iife`, the
// Android generator) get the exact same build-time-known data with zero
// runtime network dependency - no boot-time fetch() to fail, which is
// fatal on Android specifically (Chromium's fetch() categorically
// refuses `file:` URLs, and the WebView serves everything from
// file:///android_asset/). routes.gen.json's own `tag` field is
// unusable here - it's always auto-derived as "js-<component>"
// (justweb's component_tag_name), never matching this app's real
// x-editor/x-chat/... tags - so the real tag comes from
// dom-address-map.json's bound-mount `elements` entries instead
// (justweb.toml's [mounts.*].tag), joined by the shared bare component
// name. Any route whose component has no bound mount fails loud rather
// than silently mounting nothing.
import domAddressMapJson from "../public/dom-address-map.json";
import routesGenJson from "../public/routes.gen.json";

interface ResolvedRoute {
  readonly path: string;
  readonly tag: string;
  readonly mountElementId: string;
}

type DomAddressElements = Record<string, { component: string; tag?: string }>;

function resolveGeneratedRoutes(): { routes: ResolvedRoute[]; elements: DomAddressElements } {
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
// after main() has called resolveGeneratedRoutes() and boot() has
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
// whichever tab the user actually has open.
//
// Calling navigate() for real here does not lose any component state
// because every route entry above sets keepAlive: true (justjs#94):
// DefaultRouter never unmounts a keep-alive route on navigating away, and
// never remounts it on returning - only rerender()'s it. This is the real,
// supported mechanism now, not an accident of RuntimeAdapter.mount() being
// a no-op on this target (a prior version of this comment cited that as
// the reason - it was true incidentally, but would not have held under a
// real RuntimeAdapter, e.g. Android; keepAlive: true holds regardless).
const LAST_ROUTE_KEY = "justjs:ai-editor:last-route";

// Feature-grouping pass: Editor is no longer an unconditional home - a
// returning user lands back on whatever tab they were last using instead
// of always being bounced to Editor. main() only trusts this against the
// real, resolved ROUTES list (never blindly navigates to a stale/removed
// path), and Jira's OAuth-callback landing route still takes precedence
// (see main()'s landingRoute logic) since that's a more specific context
// than "wherever the user happened to be last".
function readStoredLastRoute(): string | null {
  try {
    return globalThis.localStorage?.getItem(LAST_ROUTE_KEY) ?? null;
  } catch {
    return null;
  }
}

function goToRoute(path: string): void {
  justjs.router!.navigate(path)
    .then(() => {
      showRoute(path);
      try {
        globalThis.localStorage?.setItem(LAST_ROUTE_KEY, path);
      } catch {
        // Best-effort only - navigation still works for this session even
        // if persistence fails (storage disabled/full).
      }
    })
    .catch((error: unknown) => console.error(`Error navigating to "${path}":`, error));
}

// Lets editor.ts/review.ts/scaffold.ts trigger a tab switch (e.g. Review
// jumping back to Editor on a finding click, Scaffold's "Insert into
// editor") without importing this module back - see core/navigation.ts.
document.addEventListener(NAVIGATE_EVENT, (e) => {
  goToRoute((e as CustomEvent<NavigateEventDetail>).detail.route);
});

// Two controls read/write the same theme state (the nav bar's binary
// toggle and Settings' select, added for runtime theme switching) - kept
// in sync with each other regardless of which one triggers a change.
function syncThemeUI(): void {
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) {
    const isDark = currentTheme() === "dark";
    btn.querySelector(".icon-sun")?.toggleAttribute("hidden", !isDark);
    btn.querySelector(".icon-moon")?.toggleAttribute("hidden", isDark);
  }
  const select = document.getElementById("settings-theme-select") as HTMLSelectElement | null;
  if (select) {
    select.value = currentTheme();
  }
}

function setupThemeToggle(): void {
  const btn = document.getElementById("theme-toggle-btn");
  syncThemeUI();
  btn?.addEventListener("click", () => {
    toggleTheme();
    syncThemeUI();
  });
}

function setupThemeSelect(): void {
  const select = document.getElementById("settings-theme-select") as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  for (const theme of Object.keys(THEMES) as Theme[]) {
    const option = document.createElement("option");
    option.value = theme;
    option.textContent = theme === "dark" ? "Dark" : "Light";
    select.appendChild(option);
  }
  select.value = currentTheme();
  select.addEventListener("change", () => {
    setTheme(select.value as Theme);
    syncThemeUI();
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
    // Real Atlassian OAuth redirect back to this app (Jira's real
    // connect flow, core/pm_connect.ts's beginJiraConnect()) - detected
    // before anything else, since this is a real page load with the
    // authorization `code`/`state` in the URL, not an in-app navigation.
    // Completes the token exchange, then cleans the URL via
    // history.replaceState (no reload) so a later page refresh doesn't
    // try to redeem the same one-time code again.
    // justjs#132: a real Home is the default now, not Editor - "always
    // land on the code editor regardless of what you were doing" never
    // made sense as a home. remember-last-route below still wins for
    // returning visitors; this is only the untouched first-visit default.
    let landingRoute = "/home";
    // Home is both the untouched first-visit default AND (since
    // Workspace was retired - its content is now inline on Home, see
    // sdlc_hub.ts) Jira's own explicit post-OAuth landing choice below -
    // no longer distinguishable from each other by comparing
    // landingRoute's string value alone, unlike when Jira used to land
    // on a dedicated "/workspace" route. This flag disambiguates them so
    // the last-route override further down only ever applies to the
    // genuinely untouched default, never overriding Jira's explicit choice.
    let landingRouteIsExplicit = false;
    const oauthParams = new URLSearchParams(window.location.search);
    const jiraCode = oauthParams.get("code");
    const jiraState = oauthParams.get("state");
    if (jiraCode && jiraState) {
      try {
        const redirectUri = window.location.origin + window.location.pathname;
        await completeJiraOAuthCallback(jiraCode, jiraState, redirectUri);
        // A clean, simple landing rather than trying to restore the
        // exact prior Requirement/Planning drill-down - the session is
        // already persisted, so re-opening Jira's connect screen from
        // there shows it connected immediately. Home is that clean
        // landing spot, since the SDLC hub (with Requirement/Planning's
        // PM connect screens) lives there now.
        landingRoute = "/home";
        landingRouteIsExplicit = true;
      } catch (e) {
        console.error("Jira OAuth callback failed:", e);
      } finally {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    const { routes, elements } = resolveGeneratedRoutes();
    RESOLVED_ROUTES = routes;
    ROUTES = routes.map((r) => r.path);
    MOUNT_ID_FOR_ROUTE = Object.fromEntries(routes.map((r) => [r.path, r.mountElementId]));
    DOM_ADDRESS_ELEMENTS = elements;

    // Only overrides the genuinely untouched default - Jira's OAuth
    // landing above already set something more specific, and must win.
    // Validated against the real resolved route list, never trusted blind
    // (a stale localStorage value from a route that no longer exists
    // would otherwise navigate() into a real error).
    if (!landingRouteIsExplicit) {
      const lastRoute = readStoredLastRoute();
      if (lastRoute && ROUTES.includes(lastRoute)) {
        landingRoute = lastRoute;
      }
    }

    // Stamps each real generated DDAS id (justweb.toml's [mounts]) onto
    // its container before boot, so MountStep's first resolveDdasAddressesForTag()
    // lookup finds a live element - matches justweb's own intended
    // stampMounts()-before-boot usage (cli_e2e_mounts_test.rs).
    stampMounts();

    await justjs.boot({
      routes: [...ROUTES],
      // keepAlive: true (justjs#94, shipped on dev/test - RouteRegistryEntry.keepAlive)
      // replaces the incidental keep-alive this app relied on before: a
      // no-op RuntimeAdapter plus adaptCustomElementRegistry()'s instance
      // reuse happened to make repeated unmount+remount look harmless, but
      // would genuinely destroy/recreate state under a real RuntimeAdapter
      // (e.g. Android). Every tab needs its state to survive a switch away
      // and back (an in-progress file edit, the CLI's history, a drill-down
      // screen) - the real supported mechanism now guarantees that instead
      // of depending on which RuntimeAdapter happens to be wired up.
      registry: Object.fromEntries(
        RESOLVED_ROUTES.map((r) => [r.tag, { path: r.path, component: r.tag, keepAlive: true }]),
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
        // The real working context (core/theme.ts) is constructed directly
        // via createTokensThemingProvider(), same reason as aiAssist below -
        // boot()'s weave loop never keeps the resolved aspect object around,
        // so there's no path to retrieve a live context from this config.
        // Declared here anyway so strategy "tokens" is validated/discoverable
        // like every other real aspect declaration.
        theming: { strategy: "tokens", config: { defaultTheme: currentTheme(), themes: THEMES } },
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
    goToRoute(landingRoute);

    document.querySelectorAll<HTMLElement>(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        goToRoute(btn.dataset.route!);
      });
    });

    setupThemeToggle();
    setupThemeSelect();
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
