export type Theme = "light" | "dark";

const STORAGE_KEY = "justjs:memory-demo:theme";

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

// The effective theme right now, whether from an explicit user override
// (persisted) or the system's prefers-color-scheme signal.
export function currentTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}

// No stored preference => no data-theme attribute at all, so app.css's
// prefers-color-scheme media query keeps governing (the "follow system"
// default). A stored preference sets the attribute explicitly, which
// wins over the media query by CSS specificity regardless of the
// device's actual setting.
export function applyStoredTheme(): void {
  const stored = readStoredTheme();
  if (stored) {
    document.documentElement.setAttribute("data-theme", stored);
  }
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Best-effort only - the toggle still applies for this session even
    // if persistence fails (storage disabled/full).
  }
  return next;
}
