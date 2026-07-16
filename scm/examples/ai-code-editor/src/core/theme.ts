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
    "--bg": "#f2f2f7",
    "--surface": "#ffffff",
    "--surface-alt": "#f5f5f8",
    "--text": "#1c1c1e",
    "--text-muted": "#6e6e73",
    "--border": "#e2e2e6",
    "--accent": "#667eea",
    "--accent-strong": "#5a4fcf",
    "--accent-text": "#ffffff",
    "--danger": "#e5484d",
    "--success": "#1a7f37",
    "--warning": "#b8860b",
    "--shadow": "0 1px 2px rgba(0, 0, 0, 0.06), 0 1px 8px rgba(0, 0, 0, 0.04)",
  },
  dark: {
    "--bg": "#000000",
    "--surface": "#1c1c1e",
    "--surface-alt": "#242426",
    "--text": "#f2f2f7",
    "--text-muted": "#9a9aa0",
    "--border": "#2e2e30",
    "--accent": "#7b8cf0",
    "--accent-strong": "#8f7ef5",
    "--accent-text": "#ffffff",
    "--danger": "#ff6b6f",
    "--success": "#3dd56d",
    "--warning": "#e0b23c",
    "--shadow": "0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 8px rgba(0, 0, 0, 0.3)",
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
    // Still needed for app.css's .tok-keyword/.tok-string/.tok-number
    // syntax-highlight rules, which key directly off this attribute - a
    // separate concern from THEMES' CSS variables, outside the theming
    // aspect's UIThemingContext contract.
    document.documentElement.setAttribute("data-theme", stored);
    themingContext().setTheme(stored);
  }
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  themingContext().setTheme(next);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Best-effort only - the toggle still applies for this session even
    // if persistence fails (storage disabled/full).
  }
  return next;
}
