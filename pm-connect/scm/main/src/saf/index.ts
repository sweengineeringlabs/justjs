export type { PmConnectProvider, PmResource, BearerTokenConfig, TrelloCredentialsConfig, JiraSessionConfig, PmConnectProviderConfig } from "../api/provider.js";
export { PmConnectProviderError } from "../api/provider.js";
export type {
  DashboardAnalyticsProvider,
  DashboardAnalyticsSnapshot,
  AnalyticsMetric,
  TrendingItem,
  ActivityItem,
  AnalyticsProviderConfig,
} from "../api/analytics.js";
export { DashboardAnalyticsProviderError } from "../api/analytics.js";

// Same justjs#91-pattern fix every sibling *-connect package's own
// saf/index.ts applies - importing this module's own spi/index.ts for
// its side effect means a bare `import { createPmConnectProvider } from
// "@justjs/pm-connect"` genuinely self-registers all 4 strategies.
import "../spi/index.js";

import { justjs } from "@justjs/application";
import type { PmConnectProvider, PmConnectProviderConfig } from "../api/provider.js";
import { PmConnectProviderError } from "../api/provider.js";
import type { DashboardAnalyticsProvider, AnalyticsProviderConfig } from "../api/analytics.js";
import { DashboardAnalyticsProviderError } from "../api/analytics.js";

// Jira's OAuth helpers are real, general-purpose functions the app
// calls directly (there's no valid session/config to resolve through
// the registry until after they've run) - re-exported here rather than
// forced into the PmConnectProvider/registry shape every other
// provider uses.
export { buildJiraAuthorizationUrl, exchangeJiraAuthorizationCode } from "../core/jira_oauth.js";
export type { JiraAuthorizationUrlConfig, JiraAuthorizationCodeExchangeConfig, JiraOAuthSession } from "../core/jira_oauth.js";

// Factory, not a direct class re-export (core_not_exported_directly,
// same rule every sibling *-connect package's saf/index.ts follows) -
// callers depend on the PmConnectProvider contract, never a concrete
// provider class name.
export function createPmConnectProvider(strategy: string, config: PmConnectProviderConfig): PmConnectProvider {
  const spec = justjs.providers.resolve("pmConnect", strategy);
  if (!spec) {
    throw new PmConnectProviderError("UNKNOWN_STRATEGY", `@justjs/pm-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as PmConnectProvider;
}

// Same factory pattern, separate concern ("dashboardAnalytics", justjs#139)
// - only "testpm" exists today (see spi/test_dashboard_analytics.ts);
// real per-provider strategies (linear/asana/trello/jira) land once each
// provider's own notifications/activity API is wired up.
export function createPmDashboardAnalyticsProvider(strategy: string, config: AnalyticsProviderConfig): DashboardAnalyticsProvider {
  const spec = justjs.providers.resolve("dashboardAnalytics", strategy);
  if (!spec) {
    throw new DashboardAnalyticsProviderError("UNKNOWN_STRATEGY", `@justjs/pm-connect: unknown strategy "${strategy}".`);
  }
  return spec.factory(config) as DashboardAnalyticsProvider;
}
