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
// justjs#91 (fixed): every aop-* package's saf/index.ts now imports its
// own spi/index.js for the self-registration side effect, same pattern
// @justjs/memory already used - a bare import is genuinely enough.
import "@justjs/aop-security";
import "@justjs/aop-observability";
import "@justjs/aop-flags";
import "@justjs/aop-analytics";
import "@justjs/aop-theming";
import "@justjs/aop-i18n";
import "@justjs/memory";
import "./components/chat.js";
import "./components/dashboard.js";
import "./components/curation.js";
import { initialState, reducer, getOrCreateDeviceUserId } from "./core/state.js";
import { applyStoredTheme, currentTheme, toggleTheme } from "./core/theme.js";
import {
  getStoredVoiceLanguage,
  getTtsEnabled,
  isTtsSupported,
  setStoredVoiceLanguage,
  setTtsEnabled,
  VOICE_LANGUAGES,
} from "./core/speech.js";

// Applied before boot (not inside main()'s try block) so a stored
// override takes effect on the very first paint - no flash of the
// system-default theme while boot() runs.
applyStoredTheme();


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
  // Real bug, found via verify_web.mjs: since nothing here ever
  // unmounts/remounts a route (see the comment above), x-dashboard's
  // widget overview only ever rendered once, at boot - switching away
  // to Chat, adding messages, then switching back showed stale counts
  // from before those messages existed. notifyActivated() re-renders
  // whatever view the dashboard is currently on every time its tab
  // becomes active, not just at first mount.
  if (path === "/dashboard") {
    const dashboard = document.querySelector("x-dashboard") as (HTMLElement & { notifyActivated?: () => void }) | null;
    dashboard?.notifyActivated?.();
  }
}

// Shows the icon for the theme a tap would switch TO, not the current
// one - a moon in light mode ("go dark"), a sun in dark mode ("go
// light") - the same convention most theme-toggle buttons use.
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

// Cross-cutting, header-level preferences (voice language, TTS toggle)
// live in one panel rather than scattered across the views that use
// them (chat.ts reads them straight from src/core/speech.ts's
// localStorage-backed getters - no wiring needed between this panel
// and chat.ts beyond sharing those storage keys).
//
// One tap on the gear icon shows the paginated language list directly
// - an earlier version required a second tap on a "Voice input
// language" field to open a separate modal on top of this sheet.
// Collapsed into one sheet after real usage feedback that the extra
// click made a one-thing-to-configure panel feel like two steps.
const LANG_PAGE_SIZE = 6;

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function setupSettingsPanel(): void {
  const panel = document.getElementById("settings-panel");
  const openBtn = document.getElementById("settings-btn");
  const closeBtn = document.getElementById("settings-close-btn");
  const backdrop = document.getElementById("settings-backdrop");
  const langSearch = document.getElementById("settings-lang-search") as HTMLInputElement | null;
  const langList = document.getElementById("settings-lang-list");
  const langPagination = document.getElementById("settings-lang-pagination");
  const ttsRow = document.getElementById("settings-tts-row");
  const ttsToggle = document.getElementById("settings-tts-toggle") as HTMLInputElement | null;
  let langPage = 0;

  function filteredLanguages(): typeof VOICE_LANGUAGES {
    const term = (langSearch?.value ?? "").trim().toLowerCase();
    if (!term) {
      return VOICE_LANGUAGES;
    }
    return VOICE_LANGUAGES.filter((l) => l.label.toLowerCase().includes(term));
  }

  function langTotalPages(items: typeof VOICE_LANGUAGES): number {
    return Math.max(1, Math.ceil(items.length / LANG_PAGE_SIZE));
  }

  // A real, custom-styled list instead of the platform <select> - the
  // native dropdown's popup styling (colors, spacing, font) can't be
  // meaningfully themed via CSS on either target, which is what made it
  // look out of place against the rest of this app's own design. Paged
  // rather than one long scroll, LANG_PAGE_SIZE at a time - the search
  // box filters within that same paged list rather than replacing it
  // with an unpaged scroll, so a narrow match (e.g. "Spanish") still
  // renders as a normal one-page result instead of a special case.
  function renderLangPage(): void {
    if (!langList) {
      return;
    }
    const current = getStoredVoiceLanguage();
    const items = filteredLanguages();
    const pages = langTotalPages(items);
    langPage = Math.min(Math.max(langPage, 0), pages - 1);
    const start = langPage * LANG_PAGE_SIZE;
    const pageItems = items.slice(start, start + LANG_PAGE_SIZE);

    langList.innerHTML =
      pageItems.length > 0
        ? pageItems
            .map(
              (l) => `
                <button class="lang-picker-row${l.code === current ? " active" : ""}" type="button" data-code="${l.code}">
                  <span>${l.label}</span>
                  ${l.code === current ? `<span class="lang-picker-check">✓</span>` : ""}
                </button>
              `
            )
            .join("")
        : `<p class="db-empty-hint">No languages match "${escapeHtml(langSearch?.value ?? "")}".</p>`;
    // Re-renders the same page in place rather than closing the sheet -
    // picking a language just moves the checkmark, no forced close/
    // reopen cycle if the user wants to keep browsing other pages or
    // also flip the TTS toggle right after.
    langList.querySelectorAll<HTMLButtonElement>(".lang-picker-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        setStoredVoiceLanguage(btn.dataset.code ?? "");
        renderLangPage();
      });
    });

    if (langPagination) {
      langPagination.innerHTML =
        pages > 1
          ? `
            <button id="lang-page-prev" type="button" class="pagination-btn" ${langPage === 0 ? "disabled" : ""}>‹ Prev</button>
            <span class="pagination-info">Page ${langPage + 1} of ${pages}</span>
            <button id="lang-page-next" type="button" class="pagination-btn" ${langPage >= pages - 1 ? "disabled" : ""}>Next ›</button>
          `
          : "";
      document.getElementById("lang-page-prev")?.addEventListener("click", () => {
        if (langPage > 0) {
          langPage -= 1;
          renderLangPage();
        }
      });
      document.getElementById("lang-page-next")?.addEventListener("click", () => {
        if (langPage < pages - 1) {
          langPage += 1;
          renderLangPage();
        }
      });
    }
  }

  langSearch?.addEventListener("input", () => {
    langPage = 0;
    renderLangPage();
  });

  // Genuinely absent on this app's Android WebView target (window.
  // speechSynthesis is undefined there, confirmed on real hardware, not
  // assumed - js-runtime#36's investigation surfaced this separately
  // from the mic-exclusivity finding it's actually about). Hidden
  // rather than shown-but-broken, same feature-detection convention as
  // the chat mic button.
  if (ttsRow && ttsToggle && isTtsSupported()) {
    ttsRow.hidden = false;
    ttsToggle.checked = getTtsEnabled();
    ttsToggle.addEventListener("change", () => setTtsEnabled(ttsToggle.checked));
  }

  const open = () => {
    if (langSearch) {
      langSearch.value = "";
    }
    // Jump straight to the page containing the current selection,
    // rather than always starting at page 1 - nicer than making the
    // user page-hunt for their own existing choice. Only meaningful
    // against the unfiltered list, which is what's showing since the
    // search box was just cleared above.
    const current = getStoredVoiceLanguage();
    const idx = VOICE_LANGUAGES.findIndex((l) => l.code === current);
    langPage = idx >= 0 ? Math.floor(idx / LANG_PAGE_SIZE) : 0;
    renderLangPage();
    panel?.removeAttribute("hidden");
  };
  const close = () => panel?.setAttribute("hidden", "");
  openBtn?.addEventListener("click", open);
  closeBtn?.addEventListener("click", close);
  backdrop?.addEventListener("click", close);
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

    setupThemeToggle();
    setupSettingsPanel();

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
