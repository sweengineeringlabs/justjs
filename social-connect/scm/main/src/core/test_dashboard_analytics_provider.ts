import type { DashboardAnalyticsProvider, DashboardAnalyticsSnapshot, AnalyticsProviderConfig } from "../api/analytics.js";
import { DashboardAnalyticsProviderError } from "../api/analytics.js";

// Real, in-memory-only provider - never makes a network call, mirrors
// TestSocialConnectProvider's own reasoning exactly (see
// core/test_social_provider.ts). Exists because none of the real
// providers here return engagement-style analytics today (Mastodon's/
// Bluesky's/Reddit's own connect() calls return plain resource lists,
// not DM/like/inbox counts - see api/provider.ts), so this lets
// Dashboard's Analytics/Trending/Recent-Activity UI (justjs#137) be
// built and tested against real, deterministic data now, ahead of any
// one real provider's own notification API being wired up.
//
// Strategy is "testsocial" (not a generic "test") - it registers under
// the exact same id as the Test Social *connect* provider
// (core/test_social_provider.ts) so a consuming app can resolve
// analytics for a given connected provider by that provider's own id
// (createDashboardAnalyticsProvider(providerId, ...)) uniformly, the
// same way it already resolves connect() by provider id. A provider
// with no matching strategy registered (Mastodon/Bluesky/Reddit, today)
// gets a real UNKNOWN_STRATEGY error rather than silently borrowing this
// fake data - see ai-code-editor's core/socials_analytics.ts for how the
// consuming app turns that into an honest "not available yet" message.
//
// Same "fail" token convention as TestSocialConnectProvider - an
// omitted token succeeds with canned data; a token containing "fail"
// simulates a real fetch failure, so Dashboard's per-provider error
// handling can be exercised live, not just via DI-fake unit tests.
export class TestDashboardAnalyticsProvider implements DashboardAnalyticsProvider {
  readonly concern = "dashboardAnalytics" as const;
  readonly strategy = "testsocial";

  constructor(private readonly config: AnalyticsProviderConfig) {}

  async fetchAnalytics(): Promise<DashboardAnalyticsSnapshot> {
    const token = this.config.token ?? "";
    if (token.toLowerCase().includes("fail")) {
      throw new DashboardAnalyticsProviderError(
        "REQUEST_FAILED",
        `Test Dashboard: simulated failure - the token "${token}" contains "fail".`
      );
    }
    return {
      metrics: [
        {
          label: "DMs",
          count: 3,
          items: [
            { id: "dm-1", label: "Test User Alpha: \"Hey, saw your test list!\"" },
            { id: "dm-2", label: "Test User Beta: \"Following up on Test List Beta\"" },
            { id: "dm-3", label: "Test User Gamma: \"Archived list looks good\"" },
          ],
        },
        {
          label: "Likes",
          count: 1,
          items: [{ id: "like-1", label: "Test User Alpha liked Test List Alpha" }],
        },
        {
          label: "Inbox",
          count: 1,
          items: [{ id: "inbox-1", label: "New request: join Test List Beta" }],
        },
        {
          label: "Posts from following",
          count: 3,
          items: [
            { id: "post-1", label: "Test User Alpha: \"Testing the new Dashboard\"" },
            { id: "post-2", label: "Test User Beta: \"Test List Gamma archived today\"" },
            { id: "post-3", label: "Test User Gamma: \"Loving Test Social\"" },
          ],
        },
      ],
      trending: [
        { id: "trend-1", title: "Trending Test Topic Alpha", score: 42 },
        { id: "trend-2", title: "Trending Test Topic Beta", score: 17 },
      ],
      recentActivity: [
        { id: "activity-1", summary: "New follower: Test User Alpha", timestamp: "2026-07-24T09:00:00.000Z" },
        { id: "activity-2", summary: "Test List Beta updated", timestamp: "2026-07-24T08:30:00.000Z" },
        { id: "activity-3", summary: "New like on Test List Alpha", timestamp: "2026-07-24T07:15:00.000Z" },
      ],
    };
  }

  weave(): void {
    // Real no-op - see api/analytics.ts's DashboardAnalyticsProvider.weave() comment.
  }
}
