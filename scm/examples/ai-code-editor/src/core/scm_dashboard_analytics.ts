// Real consolidation across every connected + Settings-enabled SCM
// provider (justjs#139, replicating justjs#137's Socials Dashboard
// pattern exactly). Only providers with their own registered
// "dashboardAnalytics" strategy contribute real data; today none of
// GitHub/GitLab/Bitbucket have one (see
// scm-connect/core/test_dashboard_analytics_provider.ts's own comment on
// why its "testscm" strategy is deliberately unreachable through the
// real catalog) - every connected provider is reported honestly as
// unavailable rather than fabricating numbers.
//
// Deps are injectable (DI-fakes convention, justjs#139's own Tasks) so
// this can be tested against a fake catalog/fetch without needing a
// live "testscm" catalog entry - unlike Socials, where "Test Social" is
// itself a real, selectable connect provider. Real callers use the
// default (no args).
import { createScmDashboardAnalyticsProvider, DashboardAnalyticsProviderError } from "@justjs/scm-connect";
import type { DashboardAnalyticsSnapshot } from "@justjs/scm-connect";
import { getStoredScmToken } from "./scm_credentials.js";
import { SCM_PROVIDER_CATALOG, isScmProviderConnected } from "./scm_catalog.js";
import type { ScmProvider } from "./scm_catalog.js";
import { isScmDashboardProviderEnabled } from "./scm_dashboard_settings.js";

export interface ScmDashboardMetricEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly label: string;
  readonly count: number;
  readonly items: readonly { readonly id: string; readonly label: string }[];
}

export interface ScmDashboardTrendingEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly id: string;
  readonly title: string;
  readonly score: number;
}

export interface ScmDashboardActivityEntry {
  readonly providerId: string;
  readonly providerName: string;
  readonly id: string;
  readonly summary: string;
  readonly timestamp: string;
}

export interface ScmDashboardUnavailableProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly message: string;
}

export interface ConsolidatedScmDashboardAnalytics {
  readonly metrics: readonly ScmDashboardMetricEntry[];
  readonly trending: readonly ScmDashboardTrendingEntry[];
  readonly recentActivity: readonly ScmDashboardActivityEntry[];
  readonly unavailable: readonly ScmDashboardUnavailableProvider[];
}

export interface ScmDashboardAnalyticsDeps {
  readonly catalog: readonly ScmProvider[];
  readonly isConnected: (p: ScmProvider) => boolean;
  readonly isEnabled: (providerId: string) => boolean;
  readonly getToken: (providerId: string) => string;
  readonly fetchAnalytics: (providerId: string, token: string) => Promise<DashboardAnalyticsSnapshot>;
}

function fetchScmDashboardAnalytics(providerId: string, token: string): Promise<DashboardAnalyticsSnapshot> {
  return createScmDashboardAnalyticsProvider(providerId, { token }).fetchAnalytics();
}

const REAL_DEPS: ScmDashboardAnalyticsDeps = {
  catalog: SCM_PROVIDER_CATALOG,
  isConnected: isScmProviderConnected,
  isEnabled: isScmDashboardProviderEnabled,
  getToken: getStoredScmToken,
  fetchAnalytics: fetchScmDashboardAnalytics,
};

export async function fetchConsolidatedScmDashboardAnalytics(deps: ScmDashboardAnalyticsDeps = REAL_DEPS): Promise<ConsolidatedScmDashboardAnalytics> {
  const providers = deps.catalog.filter(deps.isConnected).filter((p) => deps.isEnabled(p.id));

  const settled = await Promise.allSettled(
    providers.map(async (p) => ({
      provider: p,
      snapshot: await deps.fetchAnalytics(p.id, deps.getToken(p.id)),
    }))
  );

  const metrics: ScmDashboardMetricEntry[] = [];
  const trending: ScmDashboardTrendingEntry[] = [];
  const recentActivity: ScmDashboardActivityEntry[] = [];
  const unavailable: ScmDashboardUnavailableProvider[] = [];

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
