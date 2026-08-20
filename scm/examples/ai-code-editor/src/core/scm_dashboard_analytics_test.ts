import { describe, it, expect } from "bun:test";
import { DashboardAnalyticsProviderError } from "@justjs/scm-connect";
import { fetchConsolidatedScmDashboardAnalytics } from "./scm_dashboard_analytics.js";
import type { ScmDashboardAnalyticsDeps } from "./scm_dashboard_analytics.js";
import type { ScmProvider } from "./scm_catalog.js";

// DI-fakes convention (justjs#139's own Tasks) - scm-connect has no live
// "testscm" catalog entry the way Socials' real "Test Social" is (see
// scm-connect/core/test_dashboard_analytics_provider.ts's own comment),
// so the happy/error paths here are exercised against a fake catalog +
// fake fetch, not the real global SCM_PROVIDER_CATALOG.
const GITHUB: ScmProvider = { id: "github", name: "GitHub", color: "#181717", logo: "", kind: "deviceFlow" };
const GITLAB: ScmProvider = { id: "gitlab", name: "GitLab", color: "#FC6D26", logo: "", kind: "bearer" };

function makeDeps(overrides: Partial<ScmDashboardAnalyticsDeps> = {}): ScmDashboardAnalyticsDeps {
  return {
    catalog: [GITHUB, GITLAB],
    isConnected: () => true,
    isEnabled: () => true,
    getToken: () => "tok",
    fetchAnalytics: async () => ({ metrics: [], trending: [], recentActivity: [] }),
    ...overrides,
  };
}

describe("fetchConsolidatedScmDashboardAnalytics", () => {
  it("test_fetch_returns_empty_result_when_nothing_is_connected", async () => {
    const result = await fetchConsolidatedScmDashboardAnalytics(makeDeps({ isConnected: () => false }));
    expect(result).toEqual({ metrics: [], trending: [], recentActivity: [], unavailable: [] });
  });

  it("test_fetch_tags_a_wired_up_providers_real_metrics_trending_and_activity_by_source", async () => {
    const deps = makeDeps({
      fetchAnalytics: async (providerId) => {
        if (providerId !== "github") {
          throw new DashboardAnalyticsProviderError("UNKNOWN_STRATEGY", "no strategy");
        }
        return {
          metrics: [{ label: "Open PRs", count: 1, items: [{ id: "pr-1", label: "Fix bug" }] }],
          trending: [{ id: "trend-1", title: "justjs/scm-connect", score: 42 }],
          recentActivity: [{ id: "activity-1", summary: "New commit", timestamp: "2026-07-24T09:00:00.000Z" }],
        };
      },
    });
    const result = await fetchConsolidatedScmDashboardAnalytics(deps);
    expect(result.metrics).toEqual([{ providerId: "github", providerName: "GitHub", label: "Open PRs", count: 1, items: [{ id: "pr-1", label: "Fix bug" }] }]);
    expect(result.trending.length).toBe(1);
    expect(result.recentActivity.length).toBe(1);
    expect(result.unavailable).toEqual([{ providerId: "gitlab", providerName: "GitLab", message: expect.stringContaining("isn't wired up yet for GitLab") }]);
  });

  it("test_fetch_excludes_a_connected_provider_disabled_in_settings", async () => {
    const deps = makeDeps({ isEnabled: (id) => id === "github", fetchAnalytics: async () => ({ metrics: [{ label: "x", count: 0, items: [] }], trending: [], recentActivity: [] }) });
    const result = await fetchConsolidatedScmDashboardAnalytics(deps);
    // github is enabled but its fake fetch above returns a metric with
    // count 0 - still counted as a real (non-unavailable) result;
    // gitlab is excluded entirely by isEnabled, contributing nothing to
    // either metrics or unavailable.
    expect(result.metrics.every((m) => m.providerId === "github")).toBe(true);
    expect(result.unavailable).toEqual([]);
  });

  it("test_fetch_isolates_one_providers_failure_without_dropping_a_working_providers_data", async () => {
    const deps = makeDeps({
      fetchAnalytics: async (providerId) => {
        if (providerId === "gitlab") {
          throw new Error("network down");
        }
        return { metrics: [{ label: "Open PRs", count: 1, items: [{ id: "pr-1", label: "Fix bug" }] }], trending: [], recentActivity: [] };
      },
    });
    const result = await fetchConsolidatedScmDashboardAnalytics(deps);
    expect(result.metrics.map((m) => m.providerId)).toEqual(["github"]);
    expect(result.unavailable).toEqual([{ providerId: "gitlab", providerName: "GitLab", message: "network down" }]);
  });
});
