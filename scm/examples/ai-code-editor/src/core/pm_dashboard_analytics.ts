// Real consolidation across every connected + Settings-enabled PM
// provider (justjs#139, replicating the proven SCM Dashboard pattern).
// Only providers with their own registered "dashboardAnalytics" strategy
// contribute real data; today none of Linear/Asana/Trello/Jira have one
// (see pm-connect/core/test_dashboard_analytics_provider.ts's own
// comment on why its "testpm" strategy is deliberately unreachable
// through the real catalog) - every connected provider is reported
// honestly as unavailable rather than fabricating numbers.
//
// Deps are injectable (DI-fakes convention) so this can be tested
// against a fake catalog/fetch without needing a live "testpm" catalog
// entry. Real callers use the default (no args).
import { createPmDashboardAnalyticsProvider, DashboardAnalyticsProviderError } from "@justjs/pm-connect";
import type { DashboardAnalyticsSnapshot } from "@justjs/pm-connect";
import { getStoredPmToken } from "./pm_credentials.js";
import { PM_PROVIDER_CATALOG, isPmProviderConnected } from "./pm_catalog.js";
import type { PmProvider } from "./pm_catalog.js";
import { isPmDashboardProviderEnabled } from "./pm_dashboard_settings.js";

export interface PmDashboardMetricEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly label: string;
  readonly count: number;
  readonly items: readonly { readonly id: string; readonly label: string }[];
}

export interface PmDashboardTrendingEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly id: string;
  readonly title: string;
  readonly score: number;
}

export interface PmDashboardActivityEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly id: string;
  readonly summary: string;
  readonly timestamp: string;
}

export interface PmDashboardUnavailableProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly message: string;
}

export interface ConsolidatedPmDashboardAnalytics {
  readonly metrics: readonly PmDashboardMetricEntry[];
  readonly trending: readonly PmDashboardTrendingEntry[];
  readonly recentActivity: readonly PmDashboardActivityEntry[];
  readonly unavailable: readonly PmDashboardUnavailableProvider[];
}

export interface PmDashboardAnalyticsDeps {
  readonly catalog: readonly PmProvider[];
  readonly isConnected: (p: PmProvider) => boolean;
  readonly isEnabled: (providerId: string) => boolean;
  readonly getToken: (providerId: string) => string;
  readonly fetchAnalytics: (providerId: string, token: string) => Promise<DashboardAnalyticsSnapshot>;
}

function fetchPmDashboardAnalytics(providerId: string, token: string): Promise<DashboardAnalyticsSnapshot> {
  return createPmDashboardAnalyticsProvider(providerId, { token }).fetchAnalytics();
}

const REAL_DEPS: PmDashboardAnalyticsDeps = {
  catalog: PM_PROVIDER_CATALOG,
  isConnected: isPmProviderConnected,
  isEnabled: isPmDashboardProviderEnabled,
  getToken: getStoredPmToken,
  fetchAnalytics: fetchPmDashboardAnalytics,
};

export async function fetchConsolidatedPmDashboardAnalytics(deps: PmDashboardAnalyticsDeps = REAL_DEPS): Promise<ConsolidatedPmDashboardAnalytics> {
  const providers = deps.catalog.filter(deps.isConnected).filter((p) => deps.isEnabled(p.id));

  const settled = await Promise.allSettled(
    providers.map(async (p) => ({
      provider: p,
      snapshot: await deps.fetchAnalytics(p.id, deps.getToken(p.id)),
    }))
  );

  const metrics: PmDashboardMetricEntry[] = [];
  const trending: PmDashboardTrendingEntry[] = [];
  const recentActivity: PmDashboardActivityEntry[] = [];
  const unavailable: PmDashboardUnavailableProvider[] = [];

  settled.forEach((result, i) => {
    const provider = providers[i]!;
    if (result.status === "rejected") {
      const error = result.reason;
      const isUnknownStrategy = error instanceof DashboardAnalyticsProviderError && error.code === "UNKNOWN_STRATEGY";
      unavailable.push({
        providerId: provider.id,
        providerName: provider.name,
        message: isUnknownStrategy
          ? `Analytics isn't wired up yet for ${provider.name} - no real notifications/activity API integration exists for it today.`
          : error instanceof Error
            ? error.message
            : String(error),
      });
      return;
    }
    const { snapshot } = result.value;
    for (const m of snapshot.metrics) {
      metrics.push({ providerId: provider.id, providerName: provider.name, label: m.label, count: m.count, items: m.items });
    }
    for (const t of snapshot.trending) {
      trending.push({ providerId: provider.id, providerName: provider.name, id: t.id, title: t.title, score: t.score });
    }
    for (const a of snapshot.recentActivity) {
      recentActivity.push({ providerId: provider.id, providerName: provider.name, id: a.id, summary: a.summary, timestamp: a.timestamp });
    }
  });

  trending.sort((a, b) => b.score - a.score);
  recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return { metrics, trending, recentActivity, unavailable };
}
