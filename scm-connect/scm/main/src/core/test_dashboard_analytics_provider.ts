import type { DashboardAnalyticsProvider, DashboardAnalyticsSnapshot, AnalyticsProviderConfig } from "../api/analytics.js";
import { DashboardAnalyticsProviderError } from "../api/analytics.js";

// Real, in-memory-only provider - never makes a network call, mirrors
// @justjs/social-connect's own TestDashboardAnalyticsProvider exactly
// (justjs#139, replicating justjs#137's proven pattern).
//
// Strategy is "testscm" - deliberately NOT "github"/"gitlab"/"bitbucket".
// Unlike Socials (whose "Test Social" is a real, selectable catalog
// entry a user can connect to), scm-connect has no fake connect
// provider - only 3 real ones. None of GitHub/GitLab/Bitbucket has a
// real notifications/activity API wired up here yet, so keying this
// strategy to one of their ids would mean a user who connects a real
// GitHub account sees fabricated analytics attributed to their real
// account - exactly what DashboardAnalyticsProviderError's own
// UNKNOWN_STRATEGY handling exists to prevent. "testscm" is unreachable
// through the real SCM catalog/connect flow by design: every real
// connected provider honestly reports "not available yet" until it gets
// its own real strategy, and this class is exercised directly by this
// package's own tests plus the app's DI-fake consolidation tests
// instead of via a live catalog entry.
export class TestScmDashboardAnalyticsProvider implements DashboardAnalyticsProvider {
  readonly concern = "dashboardAnalytics" as const;
  readonly strategy = "testscm";

  constructor(private readonly config: AnalyticsProviderConfig) {}

  async fetchAnalytics(): Promise<DashboardAnalyticsSnapshot> {
    const token = this.config.token ?? "";
    if (token.toLowerCase().includes("fail")) {
      throw new DashboardAnalyticsProviderError(
        "REQUEST_FAILED",
        `Test SCM Dashboard: simulated failure - the token "${token}" contains "fail".`
      );
    }
    return {
      metrics: [
        {
          label: "Open PRs",
          count: 3,
          items: [
            { id: "pr-1", label: "Fix flaky auth test" },
            { id: "pr-2", label: "Add pagination to search endpoint" },
            { id: "pr-3", label: "Bump base image to Node 22" },
          ],
        },
        {
          label: "Issues assigned",
          count: 2,
          items: [
            { id: "issue-1", label: "Repro: crash on empty upload" },
            { id: "issue-2", label: "Docs: outdated install steps" },
          ],
        },
        {
          label: "Review requests",
          count: 1,
          items: [{ id: "review-1", label: "Refactor: extract shared client" }],
        },
      ],
      trending: [
        { id: "trend-1", title: "justjs/scm-connect", score: 38 },
        { id: "trend-2", title: "justjs/component-view", score: 21 },
      ],
      recentActivity: [
        { id: "activity-1", summary: "New commit pushed to main", timestamp: "2026-07-24T09:00:00.000Z" },
        { id: "activity-2", summary: "PR #42 merged", timestamp: "2026-07-24T08:30:00.000Z" },
        { id: "activity-3", summary: "New issue opened: crash on empty upload", timestamp: "2026-07-24T07:15:00.000Z" },
      ],
    };
  }

  weave(): void {
    // Real no-op - see api/analytics.ts's DashboardAnalyticsProvider.weave() comment.
  }
}
