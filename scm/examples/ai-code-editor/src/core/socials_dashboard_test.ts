import { describe, it, expect } from "bun:test";
// HTMLElement/customElements are shimmed globally via bunfig.toml's
// [test].preload (test-dom-shim.ts) - core/socials_credentials.ts
// imports @justjs/provider-connect, whose component-view dependency
// defines classes with `extends HTMLElement` at module top level.
import { fetchSocialsDashboard } from "./socials_dashboard.js";
import type { SocialsDashboardDeps } from "./socials_dashboard.js";

function fakeDeps(overrides: Partial<SocialsDashboardDeps> = {}): SocialsDashboardDeps {
  return {
    resolveSocialToken: () => "",
    resolveBlueskyCredentials: () => null,
    resolveRedditCredentials: () => null,
    connectMastodon: async () => [],
    connectBluesky: async () => [],
    connectReddit: async () => [],
    ...overrides,
  };
}

describe("fetchSocialsDashboard", () => {
  it("test_fetch_returns_empty_result_when_nothing_is_connected", async () => {
    const result = await fetchSocialsDashboard(fakeDeps());
    expect(result).toEqual({ entries: [], errors: [] });
  });

  it("test_fetch_merges_real_entries_from_multiple_connected_providers_tagged_by_source", async () => {
    const deps = fakeDeps({
      resolveSocialToken: (id) => (id === "mastodon" ? "tok" : ""),
      resolveBlueskyCredentials: () => ({ identifier: "alice.bsky.social", appPassword: "pw" }),
      connectMastodon: async () => [{ id: "1", name: "Friends", status: "followed" }],
      connectBluesky: async () => [{ id: "did:plc:xyz", name: "Bob", status: "bob.bsky.social" }],
    });
    const result = await fetchSocialsDashboard(deps);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { providerId: "mastodon", providerName: "Mastodon", providerIcon: "🐘", resource: { id: "1", name: "Friends", status: "followed" } },
      { providerId: "bluesky", providerName: "Bluesky", providerIcon: "🦋", resource: { id: "did:plc:xyz", name: "Bob", status: "bob.bsky.social" } },
    ]);
  });

  it("test_fetch_isolates_one_providers_failure_without_dropping_the_others_real_data", async () => {
    const deps = fakeDeps({
      resolveSocialToken: (id) => (id === "mastodon" ? "tok" : ""),
      resolveBlueskyCredentials: () => ({ identifier: "alice.bsky.social", appPassword: "pw" }),
      connectMastodon: async () => {
        throw new Error("Mastodon: token rejected (401).");
      },
      connectBluesky: async () => [{ id: "did:plc:xyz", name: "Bob", status: "bob.bsky.social" }],
    });
    const result = await fetchSocialsDashboard(deps);
    expect(result.entries).toEqual([
      { providerId: "bluesky", providerName: "Bluesky", providerIcon: "🦋", resource: { id: "did:plc:xyz", name: "Bob", status: "bob.bsky.social" } },
    ]);
    expect(result.errors).toEqual([{ providerId: "mastodon", providerName: "Mastodon", message: "Mastodon: token rejected (401)." }]);
  });

  it("test_fetch_never_calls_connect_for_a_not_connected_provider", async () => {
    let called = false;
    const deps = fakeDeps({ connectMastodon: async () => { called = true; return []; } });
    await fetchSocialsDashboard(deps);
    expect(called).toBe(false);
  });
});
