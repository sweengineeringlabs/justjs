// Real backing store for justjs#137's "based on what user configured
// their dash on settings tab" - Dashboard's own Settings tab (not the
// app's global Settings) toggles which connected providers contribute
// to Analytics/Trending/Recent Activity.
const STORAGE_KEY = "justjs:ai-editor:socials-dashboard-enabled-providers";

// Absence of a stored list means "every connected provider is
// included" - the sensible default before the user has ever visited
// the Settings tab. Once any provider has been explicitly toggled, a
// newly-connected provider not yet in that stored list is excluded
// until the user opts it in - a deliberate "explicit once customized"
// choice, not an oversight.
export function getEnabledDashboardProviderIds(): readonly string[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

export function setEnabledDashboardProviderIds(ids: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort only, same graceful-degradation shape as
    // socials_credentials.ts.
  }
}

export function isDashboardProviderEnabled(providerId: string): boolean {
  const enabled = getEnabledDashboardProviderIds();
  return enabled === null || enabled.includes(providerId);
}
