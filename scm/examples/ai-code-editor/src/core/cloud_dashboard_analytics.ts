// Real consolidation across every connected + Settings-enabled cloud
// provider (justjs#139, replicating the proven SCM/PM Dashboard
// pattern). Only providers with their own registered
// "dashboardAnalytics" strategy contribute real data; today none of the
// 7 connectable providers have one (see
// cloud-connect/core/test_dashboard_analytics_provider.ts's own comment
// on why its "testcloud" strategy is deliberately unreachable through
// the real catalog) - every connected provider is reported honestly as
// unavailable rather than fabricating numbers. Cloudflare (kind
// "unsupported", no real connect flow) never appears as connected, so
// it never surfaces here either.
//
// Deps are injectable (DI-fakes convention) so this can be tested
// against a fake catalog/fetch without needing a live "testcloud"
// catalog entry. Real callers use the default (no args).
import { createCloudDashboardAnalyticsProvider, DashboardAnalyticsProviderError } from "@justjs/cloud-connect";
import type { DashboardAnalyticsSnapshot } from "@justjs/cloud-connect";
import { getStoredCloudToken } from "./cloud_credentials.js";
import { CLOUD_PROVIDER_CATALOG, isCloudProviderConnected } from "./cloud_catalog.js";
import type { CloudProvider } from "./cloud_catalog.js";
import { isCloudDashboardProviderEnabled } from "./cloud_dashboard_settings.js";

export interface CloudDashboardMetricEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly label: string;
  readonly count: number;
  readonly items: readonly { readonly id: string; readonly label: string }[];
}

export interface CloudDashboardTrendingEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly id: string;
  readonly title: string;
  readonly score: number;
}

export interface CloudDashboardActivityEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly id: string;
  readonly summary: string;
  readonly timestamp: string;
}

export interface CloudDashboardUnavailableProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly message: string;
}

export interface ConsolidatedCloudDashboardAnalytics {
  readonly metrics: readonly CloudDashboardMetricEntry[];
  readonly trending: readonly CloudDashboardTrendingEntry[];
  readonly recentActivity: readonly CloudDashboardActivityEntry[];
  readonly unavailable: readonly CloudDashboardUnavailableProvider[];
}

export interface CloudDashboardAnalyticsDeps {
  readonly catalog: readonly CloudProvider[];
  readonly isConnected: (p: CloudProvider) => boolean;
  readonly isEnabled: (providerId: string) => boolean;
  readonly getToken: (providerId: string) => string;
  readonly fetchAnalytics: (providerId: string, token: string) => Promise<DashboardAnalyticsSnapshot>;
}

function fetchCloudDashboardAnalytics(providerId: string, token: string): Promise<DashboardAnalyticsSnapshot> {
  return createCloudDashboardAnalyticsProvider(providerId, { token }).fetchAnalytics();
}

const REAL_DEPS: CloudDashboardAnalyticsDeps = {
  catalog: CLOUD_PROVIDER_CATALOG,
  isConnected: isCloudProviderConnected,
  isEnabled: isCloudDashboardProviderEnabled,
  getToken: getStoredCloudToken,
  fetchAnalytics: fetchCloudDashboardAnalytics,
};

export async function fetchConsolidatedCloudDashboardAnalytics(deps: CloudDashboardAnalyticsDeps = REAL_DEPS): Promise<ConsolidatedCloudDashboardAnalytics> {
  const providers = deps.catalog.filter(deps.isConnected).filter((p) => deps.isEnabled(p.id));

  const settled = await Promise.allSettled(
    providers.map(async (p) => ({
      provider: p,
      snapshot: await deps.fetchAnalytics(p.id, deps.getToken(p.id)),
    }))
  );

  const metrics: CloudDashboardMetricEntry[] = [];
  const trending: CloudDashboardTrendingEntry[] = [];
  const recentActivity: CloudDashboardActivityEntry[] = [];
  const unavailable: CloudDashboardUnavailableProvider[] = [];

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
