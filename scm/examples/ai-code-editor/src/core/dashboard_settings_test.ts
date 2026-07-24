import { describe, it, expect, afterEach } from "bun:test";
import { getEnabledDashboardProviderIds, setEnabledDashboardProviderIds, isDashboardProviderEnabled } from "./dashboard_settings.js";

afterEach(() => {
  globalThis.localStorage?.removeItem("justjs:ai-editor:socials-dashboard-enabled-providers");
});

describe("dashboard_settings", () => {
  it("test_is_enabled_defaults_to_true_for_every_provider_before_any_setting_is_saved", () => {
    expect(getEnabledDashboardProviderIds()).toBeNull();
    expect(isDashboardProviderEnabled("mastodon")).toBe(true);
    expect(isDashboardProviderEnabled("testsocial")).toBe(true);
  });

  it("test_set_then_get_round_trips_the_real_enabled_list", () => {
    setEnabledDashboardProviderIds(["testsocial"]);
    expect(getEnabledDashboardProviderIds()).toEqual(["testsocial"]);
  });

  it("test_is_enabled_returns_false_for_a_provider_excluded_from_a_saved_list", () => {
    setEnabledDashboardProviderIds(["testsocial"]);
    expect(isDashboardProviderEnabled("testsocial")).toBe(true);
    expect(isDashboardProviderEnabled("mastodon")).toBe(false);
  });
});
