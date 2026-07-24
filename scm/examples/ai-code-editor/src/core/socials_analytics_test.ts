import { describe, it, expect, afterEach } from "bun:test";
// HTMLElement/customElements are shimmed globally via bunfig.toml's
// [test].preload (test-dom-shim.ts) - core/socials_credentials.ts
// imports @justjs/provider-connect, whose component-view dependency
// defines classes with `extends HTMLElement` at module top level.
import { fetchConsolidatedDashboardAnalytics } from "./socials_analytics.js";
import { setStoredSocialToken } from "./socials_credentials.js";
import { setEnabledDashboardProviderIds } from "./dashboard_settings.js";

afterEach(() => {
  setStoredSocialToken("testsocial", "");
  setEnabledDashboardProviderIds([]);
  globalThis.localStorage?.removeItem("justjs:ai-editor:socials-dashboard-enabled-providers");
});

describe("fetchConsolidatedDashboardAnalytics", () => {
  it("test_fetch_returns_empty_result_when_nothing_is_connected", async () => {
    const result = await fetchConsolidatedDashboardAnalytics();
    expect(result).toEqual({ metrics: [], trending: [], recentActivity: [], unavailable: [] });
  });

  it("test_fetch_tags_test_socials_real_metrics_trending_and_activity_by_source", async () => {
    setStoredSocialToken("testsocial", "ok");
    const result = await fetchConsolidatedDashboardAnalytics();
    expect(result.unavailable).toEqual([]);
    expect(result.metrics.length).toBeGreaterThan(0);
    expect(result.metrics.every((m) => m.providerId === "testsocial" && m.providerName === "Test Social")).toBe(true);
    expect(result.trending.length).toBeGreaterThan(0);
    expect(result.recentActivity.length).toBeGreaterThan(0);
  });

  it("test_fetch_reports_a_connected_provider_with_no_analytics_strategy_as_unavailable_not_fake_data", async () => {
    setStoredSocialToken("mastodon", "tok");
    const result = await fetchConsolidatedDashboardAnalytics();
    expect(result.metrics).toEqual([]);
    expect(result.unavailable).toEqual([{ providerId: "mastodon", providerName: "Mastodon", message: expect.stringContaining("isn't wired up yet for Mastodon") }]);
    setStoredSocialToken("mastodon", "");
  });

  it("test_fetch_excludes_a_connected_provider_disabled_in_settings", async () => {
    setStoredSocialToken("testsocial", "ok");
    setEnabledDashboardProviderIds([]);
    const result = await fetchConsolidatedDashboardAnalytics();
    expect(result.metrics).toEqual([]);
    expect(result.unavailable).toEqual([]);
  });

  it("test_fetch_isolates_one_providers_failure_without_dropping_a_working_providers_data", async () => {
    setStoredSocialToken("testsocial", "please-fail");
    setStoredSocialToken("mastodon", "tok");
    const result = await fetchConsolidatedDashboardAnalytics();
    expect(result.metrics).toEqual([]);
    expect(result.unavailable.map((u) => u.providerId).sort()).toEqual(["mastodon", "testsocial"]);
    setStoredSocialToken("mastodon", "");
  });
});
