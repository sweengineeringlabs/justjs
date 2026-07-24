import { describe, it, expect } from "bun:test";
import { DashboardAnalyticsProviderError } from "@justjs/pm-connect";
import { fetchConsolidatedPmDashboardAnalytics } from "./pm_dashboard_analytics.js";
import type { PmDashboardAnalyticsDeps } from "./pm_dashboard_analytics.js";
import type { PmProvider } from "./pm_catalog.js";

// DI-fakes convention - pm-connect has no live "testpm" catalog entry
// (see pm-connect/core/test_dashboard_analytics_provider.ts's own
// comment), so the happy/error paths here are exercised against a fake
// catalog + fake fetch, not the real global PM_PROVIDER_CATALOG.
const LINEAR: PmProvider = { id: "linear", name: "Linear", color: "#5E6AD2", logo: "", kind: "bearer" };
const JIRA: PmProvider = { id: "jira", name: "Jira", color: "#0052CC", logo: "", kind: "oauth" };

function makeDeps(overrides: Partial<PmDashboardAnalyticsDeps> = {}): PmDashboardAnalyticsDeps {
  return {
    catalog: [LINEAR, JIRA],
    isConnected: () => true,
    isEnabled: () => true,
    getToken: () => "tok",
    fetchAnalytics: async () => ({ metrics: [], trending: [], recentActivity: [] }),
    ...overrides,
  };
}

describe("fetchConsolidatedPmDashboardAnalytics", () => {
  it("test_fetch_returns_empty_result_when_nothing_is_connected", async () => {
    const result = await fetchConsolidatedPmDashboardAnalytics(makeDeps({ isConnected: () => false }));
    expect(result).toEqual({ metrics: [], trending: [], recentActivity: [], unavailable: [] });
  });

  it("test_fetch_tags_a_wired_up_providers_real_metrics_trending_and_activity_by_source", async () => {
    const deps = makeDeps({
      fetchAnalytics: async (providerId) => {
        if (providerId !== "linear") {
          throw new DashboardAnalyticsProviderError("UNKNOWN_STRATEGY", "no strategy");
        }
        return {
          metrics: [{ label: "Assigned issues", count: 1, items: [{ id: "issue-1", label: "Fix bug" }] }],
          trending: [{ id: "trend-1", title: "Test Board Alpha", score: 31 }],
          recentActivity: [{ id: "activity-1", summary: "Issue moved", timestamp: "2026-07-24T09:00:00.000Z" }],
        };
      },
    });
    const result = await fetchConsolidatedPmDashboardAnalytics(deps);
    expect(result.metrics).toEqual([{ providerId: "linear", providerName: "Linear", label: "Assigned issues", count: 1, items: [{ id: "issue-1", label: "Fix bug" }] }]);
    expect(result.trending.length).toBe(1);
    expect(result.recentActivity.length).toBe(1);
    expect(result.unavailable).toEqual([{ providerId: "jira", providerName: "Jira", message: expect.stringContaining("isn't wired up yet for Jira") }]);
  });

  it("test_fetch_excludes_a_connected_provider_disabled_in_settings", async () => {
    const deps = makeDeps({ isEnabled: (id) => id === "linear", fetchAnalytics: async () => ({ metrics: [{ label: "x", count: 0, items: [] }], trending: [], recentActivity: [] }) });
    const result = await fetchConsolidatedPmDashboardAnalytics(deps);
    expect(result.metrics.every((m) => m.providerId === "linear")).toBe(true);
    expect(result.unavailable).toEqual([]);
  });

  it("test_fetch_isolates_one_providers_failure_without_dropping_a_working_providers_data", async () => {
    const deps = makeDeps({
      fetchAnalytics: async (providerId) => {
        if (providerId === "jira") {
          throw new Error("network down");
        }
        return { metrics: [{ label: "Assigned issues", count: 1, items: [{ id: "issue-1", label: "Fix bug" }] }], trending: [], recentActivity: [] };
      },
    });
    const result = await fetchConsolidatedPmDashboardAnalytics(deps);
    expect(result.metrics.map((m) => m.providerId)).toEqual(["linear"]);
    expect(result.unavailable).toEqual([{ providerId: "jira", providerName: "Jira", message: "network down" }]);
  });
});
