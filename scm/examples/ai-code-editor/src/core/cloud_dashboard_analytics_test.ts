import { describe, it, expect } from "bun:test";
import { DashboardAnalyticsProviderError } from "@justjs/cloud-connect";
import { fetchConsolidatedCloudDashboardAnalytics } from "./cloud_dashboard_analytics.js";
import type { CloudDashboardAnalyticsDeps } from "./cloud_dashboard_analytics.js";
import type { CloudProvider } from "./cloud_catalog.js";

// DI-fakes convention - cloud-connect has no live "testcloud" catalog
// entry (see cloud-connect/core/test_dashboard_analytics_provider.ts's
// own comment), so the happy/error paths here are exercised against a
// fake catalog + fake fetch, not the real global CLOUD_PROVIDER_CATALOG.
const NETLIFY: CloudProvider = { id: "netlify", name: "Netlify", icon: "🟢", color: "#00C7B7", kind: "bearer" };
const AWS: CloudProvider = { id: "aws", name: "AWS", icon: "🟧", color: "#FF9900", kind: "aws" };

function makeDeps(overrides: Partial<CloudDashboardAnalyticsDeps> = {}): CloudDashboardAnalyticsDeps {
  return {
    catalog: [NETLIFY, AWS],
    isConnected: () => true,
    isEnabled: () => true,
    getToken: () => "tok",
    fetchAnalytics: async () => ({ metrics: [], trending: [], recentActivity: [] }),
    ...overrides,
  };
}

describe("fetchConsolidatedCloudDashboardAnalytics", () => {
  it("test_fetch_returns_empty_result_when_nothing_is_connected", async () => {
    const result = await fetchConsolidatedCloudDashboardAnalytics(makeDeps({ isConnected: () => false }));
    expect(result).toEqual({ metrics: [], trending: [], recentActivity: [], unavailable: [] });
  });

  it("test_fetch_tags_a_wired_up_providers_real_metrics_trending_and_activity_by_source", async () => {
    const deps = makeDeps({
      fetchAnalytics: async (providerId) => {
        if (providerId !== "netlify") {
          throw new DashboardAnalyticsProviderError("UNKNOWN_STRATEGY", "no strategy");
        }
        return {
          metrics: [{ label: "Running instances", count: 1, items: [{ id: "instance-1", label: "web-01" }] }],
          trending: [{ id: "trend-1", title: "web-01", score: 27 }],
          recentActivity: [{ id: "activity-1", summary: "Deploy succeeded", timestamp: "2026-07-25T09:00:00.000Z" }],
        };
      },
    });
    const result = await fetchConsolidatedCloudDashboardAnalytics(deps);
    expect(result.metrics).toEqual([{ providerId: "netlify", providerName: "Netlify", label: "Running instances", count: 1, items: [{ id: "instance-1", label: "web-01" }] }]);
    expect(result.trending.length).toBe(1);
    expect(result.recentActivity.length).toBe(1);
    expect(result.unavailable).toEqual([{ providerId: "aws", providerName: "AWS", message: expect.stringContaining("isn't wired up yet for AWS") }]);
  });

  it("test_fetch_excludes_a_connected_provider_disabled_in_settings", async () => {
    const deps = makeDeps({ isEnabled: (id) => id === "netlify", fetchAnalytics: async () => ({ metrics: [{ label: "x", count: 0, items: [] }], trending: [], recentActivity: [] }) });
    const result = await fetchConsolidatedCloudDashboardAnalytics(deps);
    expect(result.metrics.every((m) => m.providerId === "netlify")).toBe(true);
    expect(result.unavailable).toEqual([]);
  });

  it("test_fetch_isolates_one_providers_failure_without_dropping_a_working_providers_data", async () => {
    const deps = makeDeps({
      fetchAnalytics: async (providerId) => {
        if (providerId === "aws") {
          throw new Error("network down");
        }
        return { metrics: [{ label: "Running instances", count: 1, items: [{ id: "instance-1", label: "web-01" }] }], trending: [], recentActivity: [] };
      },
    });
    const result = await fetchConsolidatedCloudDashboardAnalytics(deps);
    expect(result.metrics.map((m) => m.providerId)).toEqual(["netlify"]);
    expect(result.unavailable).toEqual([{ providerId: "aws", providerName: "AWS", message: "network down" }]);
  });
});
