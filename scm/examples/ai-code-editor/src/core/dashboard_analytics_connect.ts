// Thin app-local adapter over @justjs/social-connect's new
// "dashboardAnalytics" concern - same role core/socials_connect.ts plays
// for "socialConnect". Only the "testsocial" strategy exists today
// (@justjs/social-connect's core/test_dashboard_analytics_provider.ts) -
// real per-provider strategies (Mastodon/Bluesky's own notification
// APIs) land once each is wired up, tracked under justjs#137. Strategy
// is keyed by the same provider id socials_connect.ts's connect
// functions use, so a caller can resolve analytics for whichever
// provider is connected without a separate lookup table.
import { createDashboardAnalyticsProvider } from "@justjs/social-connect";
import type { DashboardAnalyticsSnapshot } from "@justjs/social-connect";

export type { DashboardAnalyticsSnapshot };

export function fetchDashboardAnalytics(providerId: string, token: string): Promise<DashboardAnalyticsSnapshot> {
  return createDashboardAnalyticsProvider(providerId, { token }).fetchAnalytics();
}
