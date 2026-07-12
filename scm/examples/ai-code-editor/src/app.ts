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

const ROUTES = ["/editor", "/chat", "/review", "/scaffold", "/workspace"] as const;
const MOUNT_ID_FOR_ROUTE: Record<string, string> = {
  "/editor": "mount-editor",
  "/chat": "mount-chat",
  "/review": "mount-review",
  "/scaffold": "mount-scaffold",
  "/workspace": "mount-workspace",
};

// RuntimeAdapter.mount() is a no-op on both targets (same finding as
// cross-target-demo/agentic-memory-demo) - all four routes are mounted
// once at boot, and navigating between them is purely a CSS `.active`
// toggle on the already-mounted containers.
function showRoute(path: string): void {
  for (const [route, mountId] of Object.entries(MOUNT_ID_FOR_ROUTE)) {
    document.getElementById(mountId)?.classList.toggle("active", route === path);
  }
  document.querySelectorAll<HTMLElement>(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.route === path);
  });
}

// Lets editor.ts/review.ts/scaffold.ts trigger a tab switch (e.g. Review
// jumping back to Editor on a finding click, Scaffold's "Insert into
// editor") without importing this module back - see core/navigation.ts.
document.addEventListener(NAVIGATE_EVENT, (e) => {
  showRoute((e as CustomEvent<NavigateEventDetail>).detail.route);
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
    await justjs.boot({
      routes: [...ROUTES],
      registry: {
        "x-editor": { path: "/editor", component: "x-editor" },
        "x-chat": { path: "/chat", component: "x-chat" },
        "x-review": { path: "/review", component: "x-review" },
        "x-scaffold": { path: "/scaffold", component: "x-scaffold" },
        "x-workspace": { path: "/workspace", component: "x-workspace" },
      },
      componentRegistry: {
        "x-editor": () => Promise.resolve(customElements.get("x-editor") as CustomElementConstructor),
        "x-chat": () => Promise.resolve(customElements.get("x-chat") as CustomElementConstructor),
        "x-review": () => Promise.resolve(customElements.get("x-review") as CustomElementConstructor),
        "x-scaffold": () => Promise.resolve(customElements.get("x-scaffold") as CustomElementConstructor),
        "x-workspace": () => Promise.resolve(customElements.get("x-workspace") as CustomElementConstructor),
      },
      domAddressMap: {
        elements: {
          "ai-code-editor:home:x-editor:root": { component: "editor", tag: "x-editor" },
          "ai-code-editor:home:x-chat:root": { component: "chat", tag: "x-chat" },
          "ai-code-editor:home:x-review:root": { component: "review", tag: "x-review" },
          "ai-code-editor:home:x-scaffold:root": { component: "scaffold", tag: "x-scaffold" },
          "ai-code-editor:home:x-workspace:root": { component: "workspace", tag: "x-workspace" },
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
        // "aiAssist" deliberately NOT listed here - see
        // @justjs/ai-assist's spi/index.ts. boot()'s weave loop calls
        // spec.factory() with ZERO arguments, and
        // AiAssistProviderConfig.apiKey is required, so that path can
        // never produce a working provider. This app's real singleton
        // (core/ai_assist.ts's getAiAssistProvider()) is built directly
        // via createAiAssistProvider(config), with a real config.
      },
    });

    for (const route of ROUTES) {
      await justjs.router!.navigate(route);
    }
    showRoute("/editor");

    document.querySelectorAll<HTMLElement>(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        showRoute(btn.dataset.route!);
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
