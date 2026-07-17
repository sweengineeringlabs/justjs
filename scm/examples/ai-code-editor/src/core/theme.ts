import { createTokensThemingProvider } from "@justjs/aop-theming";
import type { UIThemingContext } from "@justjs/aop-theming";

export type Theme = "light" | "dark";

const STORAGE_KEY = "justjs:ai-editor:theme";

// Real usage of the justjs#131 tokens theming strategy, not just
// unit-tested in isolation - these are the same values app.css's
// :root[data-theme="light"/"dark"] blocks used to hardcode before this
// landed (justjs#93); that CSS is gone now, superseded by setTheme()
// applying these as real inline custom properties. Built directly
// (never through boot()'s `aspects` config) for the same reason
// core/ai_assist.ts is: boot()'s weave loop resolves each aspect's
// factory() and calls weave() on it, but never keeps the resulting
// object around, so there is currently no way to retrieve a live
// context back out of boot() - see
// application/scm/main/src/core/boot.ts's boot() method.
export const THEMES: Record<Theme, Record<string, string>> = {
  light: {
    "--bg": "#f7f8fa",
    "--surface": "#ffffff",
    "--surface-alt": "#eef0f4",
    "--text": "#12151c",
    "--text-muted": "#5b6472",
    "--border": "#e2e5eb",
    "--accent": "#4f46e5",
    "--accent-strong": "#4338ca",
    "--accent-2": "#d97706",
    "--accent-text": "#ffffff",
    "--danger": "#e5484d",
    "--success": "#1a7f37",
    "--warning": "#b8860b",
    "--shadow": "0 1px 2px rgba(16, 24, 40, 0.06), 0 2px 10px rgba(16, 24, 40, 0.06)",
    "--shadow-md": "0 4px 16px rgba(16, 24, 40, 0.08), 0 2px 6px rgba(16, 24, 40, 0.06)",
  },
  dark: {
    "--bg": "#0a0e16",
    "--surface": "#131826",
    "--surface-alt": "#1a2033",
    "--text": "#eef1f6",
    "--text-muted": "#8b93a8",
    "--border": "#242c3d",
    "--accent": "#6366f1",
    "--accent-strong": "#818cf8",
    "--accent-2": "#f59e0b",
    "--accent-text": "#ffffff",
    "--danger": "#ff6b6f",
    "--success": "#3dd56d",
    "--warning": "#e0b23c",
    "--shadow": "0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 8px rgba(0, 0, 0, 0.3)",
    "--shadow-md": "0 4px 16px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.4)",
  },
};

let cachedContext: UIThemingContext | null = null;

function themingContext(): UIThemingContext {
  if (!cachedContext) {
    const aspect = createTokensThemingProvider().factory({
      defaultTheme: currentTheme(),
      themes: THEMES,
    });
    cachedContext = aspect.context() as UIThemingContext;
  }
  return cachedContext;
}

function readStoredTheme(): Theme | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function currentTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}

export function applyStoredTheme(): void {
  const stored = readStoredTheme();
  if (stored) {
    applyTheme(stored);
  }
}

function applyTheme(theme: Theme): void {
  // Still needed for app.css's .tok-keyword/.tok-string/.tok-number
  // syntax-highlight rules, which key directly off this attribute - a
  // separate concern from THEMES' CSS variables, outside the theming
  // aspect's UIThemingContext contract.
  document.documentElement.setAttribute("data-theme", theme);
  themingContext().setTheme(theme);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, theme);
  } catch {
    // Best-effort only - the change still applies for this session even
    // if persistence fails (storage disabled/full).
  }
}

// Sets a specific theme directly - used by the runtime theme selector in
// Settings (justjs#131 follow-up). toggleTheme() below is the nav bar's
// binary flip; this is the general case a selector with >2 options needs.
export function setTheme(theme: Theme): void {
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
