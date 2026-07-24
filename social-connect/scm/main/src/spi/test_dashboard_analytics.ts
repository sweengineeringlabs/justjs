import { justjs } from "@justjs/application";
import { TestDashboardAnalyticsProvider } from "../core/test_dashboard_analytics_provider.js";
import type { AnalyticsProviderConfig } from "../api/analytics.js";

// A real, in-memory-only strategy under the new "dashboardAnalytics"
// concern - no network call, ever. Same reasoning as spi/testsocial.ts:
// lives alongside real strategies rather than behind a build flag, and
// only activates if some catalog/UI explicitly requests strategy
// "test".
justjs.providers.register({
  concern: "dashboardAnalytics",
  strategy: "testsocial",
  factory: (config?: AnalyticsProviderConfig) => new TestDashboardAnalyticsProvider(config ?? {}),
});
