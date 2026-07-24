import type { DashboardAnalyticsProvider, DashboardAnalyticsSnapshot, AnalyticsProviderConfig } from "../api/analytics.js";
import { DashboardAnalyticsProviderError } from "../api/analytics.js";

// Real, in-memory-only provider - never makes a network call, mirrors
// @justjs/scm-connect's own TestScmDashboardAnalyticsProvider exactly
// (justjs#139, replicating the proven SCM pattern).
//
// Strategy is "testpm" - deliberately NOT "linear"/"asana"/"trello"/
// "jira". Same reasoning as scm-connect's "testscm": pm-connect has no
// fake connect provider, only 4 real ones, none with a real
// notifications/activity API wired up here yet. Keying this strategy to
// one of their ids would mean a user who connects a real Linear account
// sees fabricated analytics attributed to their real account - exactly
// what DashboardAnalyticsProviderError's own UNKNOWN_STRATEGY handling
// exists to prevent. "testpm" is unreachable through the real PM
// catalog/connect flow by design.
export class TestPmDashboardAnalyticsProvider implements DashboardAnalyticsProvider {
  readonly concern = "dashboardAnalytics" as const;
  readonly strategy = "testpm";

  constructor(private readonly config: AnalyticsProviderConfig) {}

  async fetchAnalytics(): Promise<DashboardAnalyticsSnapshot> {
    const token = this.config.token ?? "";
    if (token.toLowerCase().includes("fail")) {
      throw new DashboardAnalyticsProviderError(
        "REQUEST_FAILED",
        `Test PM Dashboard: simulated failure - the token "${token}" contains "fail".`
      );
    }
    return {
      metrics: [
        {
          label: "Assigned issues",
          count: 4,
          items: [
            { id: "issue-1", label: "Fix pagination bug" },
            { id: "issue-2", label: "Write onboarding docs" },
            { id: "issue-3", label: "Investigate flaky test" },
            { id: "issue-4", label: "Design review follow-up" },
          ],
        },
        {
          label: "Overdue tasks",
          count: 1,
          items: [{ id: "task-1", label: "Update dependency versions" }],
        },
        {
          label: "Review requests",
          count: 2,
          items: [
            { id: "review-1", label: "Sprint retro notes" },
            { id: "review-2", label: "Q3 roadmap draft" },
          ],
        },
      ],
      trending: [
        { id: "trend-1", title: "Test Board Alpha", score: 31 },
        { id: "trend-2", title: "Test Project Beta", score: 19 },
      ],
      recentActivity: [
        { id: "activity-1", summary: "Issue moved to In Progress", timestamp: "2026-07-24T09:00:00.000Z" },
        { id: "activity-2", summary: "New comment on Test Board Alpha", timestamp: "2026-07-24T08:30:00.000Z" },
        { id: "activity-3", summary: "Task marked overdue", timestamp: "2026-07-24T07:15:00.000Z" },
      ],
    };
  }

  weave(): void {
    // Real no-op - see api/analytics.ts's DashboardAnalyticsProvider.weave() comment.
  }
}
