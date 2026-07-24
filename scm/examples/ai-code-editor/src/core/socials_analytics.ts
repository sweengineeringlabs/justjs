// Real consolidation across every connected + Settings-enabled provider
// (justjs#137) - Dashboard's Analytics/Trending/Recent Activity tabs
// each aggregate across providers, tagged by source; they deliberately
// do NOT repeat the main screen's per-provider grid/tabs (a real
// mistake an earlier round of this made - see git history). Only
// providers with their own registered "dashboardAnalytics" strategy
// (today: just "testsocial") contribute real data; every other
// connected provider (Mastodon/Bluesky/Reddit) is reported honestly as
// unavailable rather than fabricating numbers.
import { DashboardAnalyticsProviderError } from "@justjs/social-connect";
import { fetchDashboardAnalytics } from "./dashboard_analytics_connect.js";
import { getStoredSocialToken } from "./socials_credentials.js";
import { SOCIAL_PROVIDER_CATALOG, isSocialProviderConnected } from "./socials_catalog.js";
import { isDashboardProviderEnabled } from "./dashboard_settings.js";

export interface DashboardMetricEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerIcon: string;
  readonly label: string;
  readonly count: number;
  readonly items: readonly { readonly id: string; readonly label: string }[];
}

export interface DashboardTrendingEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerIcon: string;
  readonly id: string;
  readonly title: string;
  readonly score: number;
}

export interface DashboardActivityEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly providerIcon: string;
  readonly id: string;
  readonly summary: string;
  readonly timestamp: string;
}

export interface DashboardUnavailableProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly message: string;
}

export interface ConsolidatedDashboardAnalytics {
  readonly metrics: readonly DashboardMetricEntry[];
  readonly trending: readonly DashboardTrendingEntry[];
  readonly recentActivity: readonly DashboardActivityEntry[];
  readonly unavailable: readonly DashboardUnavailableProvider[];
}

export async function fetchConsolidatedDashboardAnalytics(): Promise<ConsolidatedDashboardAnalytics> {
  const providers = SOCIAL_PROVIDER_CATALOG.filter(isSocialProviderConnected).filter((p) => isDashboardProviderEnabled(p.id));

  const settled = await Promise.allSettled(
    providers.map(async (p) => ({
      provider: p,
      snapshot: await fetchDashboardAnalytics(p.id, getStoredSocialToken(p.id)),
    }))
  );

  const metrics: DashboardMetricEntry[] = [];
  const trending: DashboardTrendingEntry[] = [];
  const recentActivity: DashboardActivityEntry[] = [];
  const unavailable: DashboardUnavailableProvider[] = [];

  settled.forEach((result, i) => {
    const provider = providers[i]!;
    if (result.status === "rejected") {
      const error = result.reason;
      const isUnknownStrategy = error instanceof DashboardAnalyticsProviderError && error.code === "UNKNOWN_STRATEGY";
      unavailable.push({
        providerId: provider.id,
        providerName: provider.name,
        message: isUnknownStrategy
          ? `Analytics isn't wired up yet for ${provider.name} - no real notification/engagement API integration exists for it today.`
          : error instanceof Error
            ? error.message
            : String(error),
      });
      return;
    }
    const { snapshot } = result.value;
    for (const m of snapshot.metrics) {
      metrics.push({ providerId: provider.id, providerName: provider.name, providerIcon: provider.icon, label: m.label, count: m.count, items: m.items });
    }
    for (const t of snapshot.trending) {
      trending.push({ providerId: provider.id, providerName: provider.name, providerIcon: provider.icon, id: t.id, title: t.title, score: t.score });
    }
    for (const a of snapshot.recentActivity) {
      recentActivity.push({
        providerId: provider.id,
        providerName: provider.name,
        providerIcon: provider.icon,
        id: a.id,
        summary: a.summary,
        timestamp: a.timestamp,
      });
    }
  });

  trending.sort((a, b) => b.score - a.score);
  recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { metrics, trending, recentActivity, unavailable };
}
