// Real backing store for the Cloud Dashboard's own Settings tab
// (justjs#139, replicating the proven SCM/PM Dashboard Settings
// pattern) - toggles which connected cloud providers contribute to
// Analytics/Trending/Recent Activity.
const STORAGE_KEY = "justjs:ai-editor:cloud-dashboard-enabled-providers";

// Absence of a stored list means "every connected provider is
// included" - the sensible default before the user has ever visited the
// Settings tab. Once any provider has been explicitly toggled, a
// newly-connected provider not yet in that stored list is excluded
// until the user opts it in - same reasoning as core/scm_dashboard_settings.ts.
export function getEnabledCloudDashboardProviderIds(): readonly string[] | null {
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

export function setEnabledCloudDashboardProviderIds(ids: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort only, same graceful-degradation shape as
    // core/cloud_credentials.ts.
  }
}

export function isCloudDashboardProviderEnabled(providerId: string): boolean {
  const enabled = getEnabledCloudDashboardProviderIds();
  return enabled === null || enabled.includes(providerId);
}
