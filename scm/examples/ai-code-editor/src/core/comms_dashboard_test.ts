import { describe, it, expect } from "bun:test";
import { fetchCommsDashboard } from "./comms_dashboard.js";
import type { CommsDashboardDeps } from "./comms_dashboard.js";

function fakeDeps(overrides: Partial<CommsDashboardDeps> = {}): CommsDashboardDeps {
  return {
    resolveCommsToken: () => "",
    connectSlack: async () => [],
    connectDiscord: async () => [],
    connectTeams: async () => [],
    ...overrides,
  };
}

describe("fetchCommsDashboard", () => {
  it("test_fetch_returns_empty_result_when_nothing_is_connected", async () => {
    const result = await fetchCommsDashboard(fakeDeps());
    expect(result).toEqual({ entries: [], errors: [] });
  });

  it("test_fetch_merges_real_entries_from_multiple_connected_providers_tagged_by_source", async () => {
    const deps = fakeDeps({
      resolveCommsToken: (id) => (id === "slack" || id === "discord" ? "tok" : ""),
      connectSlack: async () => [{ id: "C123", name: "general", status: "public" }],
      connectDiscord: async () => [{ id: "G1", name: "my-server", status: "owner" }],
    });
    const result = await fetchCommsDashboard(deps);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { providerId: "slack", providerName: "Slack", providerIcon: "💬", resource: { id: "C123", name: "general", status: "public" } },
      { providerId: "discord", providerName: "Discord", providerIcon: "🎮", resource: { id: "G1", name: "my-server", status: "owner" } },
    ]);
  });

  it("test_fetch_isolates_one_providers_failure_without_dropping_the_others_real_data", async () => {
    const deps = fakeDeps({
      resolveCommsToken: (id) => (id === "slack" || id === "teams" ? "tok" : ""),
      connectSlack: async () => {
        throw new Error("Slack: token rejected (invalid_auth).");
      },
      connectTeams: async () => [{ id: "T1", name: "Engineering", status: "private" }],
    });
    const result = await fetchCommsDashboard(deps);
    expect(result.entries).toEqual([
      { providerId: "teams", providerName: "Microsoft Teams", providerIcon: "👥", resource: { id: "T1", name: "Engineering", status: "private" } },
    ]);
    expect(result.errors).toEqual([{ providerId: "slack", providerName: "Slack", message: "Slack: token rejected (invalid_auth)." }]);
  });

  it("test_fetch_never_calls_connect_for_a_not_connected_provider", async () => {
    let called = false;
    const deps = fakeDeps({ connectDiscord: async () => { called = true; return []; } });
    await fetchCommsDashboard(deps);
    expect(called).toBe(false);
  });
});
