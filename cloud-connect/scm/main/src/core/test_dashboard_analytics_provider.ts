import type { DashboardAnalyticsProvider, DashboardAnalyticsSnapshot, AnalyticsProviderConfig } from "../api/analytics.js";
import { DashboardAnalyticsProviderError } from "../api/analytics.js";

// Real, in-memory-only provider - never makes a network call, mirrors
// @justjs/scm-connect's/@justjs/pm-connect's own
// TestScmDashboardAnalyticsProvider/TestPmDashboardAnalyticsProvider
// exactly (justjs#139, replicating the proven SCM pattern).
//
// Strategy is "testcloud" - deliberately NOT "aws"/"gcp"/"azure"/
// "digitalocean"/"cloudflare"/"vercel"/"netlify"/"heroku". Same
// reasoning as scm-connect's "testscm"/pm-connect's "testpm":
// cloud-connect has no fake connect provider, only 8 real ones, none
// with a real notifications/activity API wired up here yet. Keying this
// strategy to one of their ids would mean a user who connects a real
// account sees fabricated analytics attributed to it. "testcloud" is
// unreachable through the real Cloud catalog/connect flow by design.
export class TestCloudDashboardAnalyticsProvider implements DashboardAnalyticsProvider {
  readonly concern = "dashboardAnalytics" as const;
  readonly strategy = "testcloud";

  constructor(private readonly config: AnalyticsProviderConfig) {}

  async fetchAnalytics(): Promise<DashboardAnalyticsSnapshot> {
    const token = this.config.token ?? "";
    if (token.toLowerCase().includes("fail")) {
      throw new DashboardAnalyticsProviderError(
        "REQUEST_FAILED",
        `Test Cloud Dashboard: simulated failure - the token "${token}" contains "fail".`
      );
    }
    return {
      metrics: [
        {
          label: "Running instances",
          count: 3,
          items: [
            { id: "instance-1", label: "web-01 (2 vCPU, 4GB)" },
            { id: "instance-2", label: "web-02 (2 vCPU, 4GB)" },
            { id: "instance-3", label: "worker-01 (1 vCPU, 2GB)" },
          ],
        },
        {
          label: "Failed deploys",
          count: 1,
          items: [{ id: "deploy-1", label: "api-service - build timeout" }],
        },
        {
          label: "Billing alerts",
          count: 1,
          items: [{ id: "alert-1", label: "Monthly spend crossed $50 threshold" }],
        },
      ],
      trending: [
        { id: "trend-1", title: "web-01", score: 27 },
        { id: "trend-2", title: "api-service", score: 14 },
      ],
      recentActivity: [
        { id: "activity-1", summary: "Deploy succeeded: api-service v1.4.2", timestamp: "2026-07-25T09:00:00.000Z" },
        { id: "activity-2", summary: "Instance web-02 restarted", timestamp: "2026-07-25T08:30:00.000Z" },
        { id: "activity-3", summary: "Billing alert triggered", timestamp: "2026-07-25T07:15:00.000Z" },
      ],
    };
  }

  weave(): void {
    // Real no-op - see api/analytics.ts's DashboardAnalyticsProvider.weave() comment.
  }
}
