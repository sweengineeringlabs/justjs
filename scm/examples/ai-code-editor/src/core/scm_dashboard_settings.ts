// Real backing store for the SCM Dashboard's own Settings tab (justjs#139,
// replicating justjs#137's Socials Dashboard Settings pattern) - toggles
// which connected SCM providers contribute to Analytics/Trending/Recent
// Activity.
const STORAGE_KEY = "justjs:ai-editor:scm-dashboard-enabled-providers";

// Absence of a stored list means "every connected provider is
// included" - the sensible default before the user has ever visited the
// Settings tab. Once any provider has been explicitly toggled, a
// newly-connected provider not yet in that stored list is excluded
// until the user opts it in - a deliberate "explicit once customized"
// choice, not an oversight. Same reasoning as core/dashboard_settings.ts
// (Socials' own).
export function getEnabledScmDashboardProviderIds(): readonly string[] | null {
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

export function setEnabledScmDashboardProviderIds(ids: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort only, same graceful-degradation shape as
    // core/scm_credentials.ts.
  }
}

export function isScmDashboardProviderEnabled(providerId: string): boolean {
  const enabled = getEnabledScmDashboardProviderIds();
  return enabled === null || enabled.includes(providerId);
}
