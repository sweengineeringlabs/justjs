import type { AspectTarget } from "@justjs/application";

// Same shape as @justjs/social-connect's/@justjs/scm-connect's own
// api/analytics.ts (justjs#137/#139) - a free-form label + count rather
// than a fixed set of named fields, since a real PM provider's own
// engagement vocabulary (assigned issues, sprint items, overdue tasks,
// review requests...) doesn't map onto one fixed schema. `items` backs
// the metric's own drill-down - always present, `count` and
// `items.length` agree by construction.
export interface AnalyticsMetric {
  readonly label: string;
  readonly count: number;
  readonly items: readonly AnalyticsMetricItem[];
}

export interface AnalyticsMetricItem {
  readonly id: string;
  readonly label: string;
}

// A single trending item - deliberately a plain (id, title, score)
// shape, not tied to PmResource, since "trending" is a ranking over
// whatever a provider considers noteworthy right now (e.g. most-active
// boards/projects), not the same list PmConnectProvider.connect()
// already returns.
export interface TrendingItem {
  readonly id: string;
  readonly title: string;
  readonly score: number;
}

// A single recent-activity entry - a real timestamp (ISO 8601), not a
// relative string, so the consuming UI decides its own display format.
export interface ActivityItem {
  readonly id: string;
  readonly summary: string;
  readonly timestamp: string;
}

export interface DashboardAnalyticsSnapshot {
  readonly metrics: readonly AnalyticsMetric[];
  readonly trending: readonly TrendingItem[];
  readonly recentActivity: readonly ActivityItem[];
}

// Same single-bearer-token shape BearerTokenConfig already uses
// elsewhere in this package - kept separate (not reusing
// BearerTokenConfig directly) since this concern's token is optional (a
// real provider's analytics fetch may need no separate credential beyond
// whatever pmConnect already holds).
export interface AnalyticsProviderConfig {
  readonly token?: string;
}

export interface DashboardAnalyticsProvider {
  readonly concern: "dashboardAnalytics";
  readonly strategy: string;
  fetchAnalytics(): Promise<DashboardAnalyticsSnapshot>;
  // Real no-op, same boot()-contract reason PmConnectProvider.weave()
  // exists - see api/provider.ts's own comment on that method.
  weave(target: AspectTarget): void;
}

export class DashboardAnalyticsProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "DashboardAnalyticsProviderError";
  }
}
