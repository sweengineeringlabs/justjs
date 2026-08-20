import { justjs } from "@justjs/application";
import { TestCloudDashboardAnalyticsProvider } from "../core/test_dashboard_analytics_provider.js";
import type { AnalyticsProviderConfig } from "../api/analytics.js";

// A real, in-memory-only strategy under the "dashboardAnalytics" concern
// - no network call, ever. Same reasoning as spi/aws.js et al: lives
// alongside real strategies rather than behind a build flag, and only
// activates if some catalog/UI explicitly requests strategy "testcloud".
justjs.providers.register({
  concern: "dashboardAnalytics",
  strategy: "testcloud",
  factory: (config?: AnalyticsProviderConfig) => new TestCloudDashboardAnalyticsProvider(config ?? {}),
});
