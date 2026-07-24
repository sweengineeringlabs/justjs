import type { SocialConnectProvider, SocialResource, BearerTokenConfig } from "../api/provider.js";
import { SocialConnectProviderError } from "../api/provider.js";

// Real, in-memory-only provider - never makes a network call. Exists so
// a consuming app's Dashboard/Agent features (justjs#137, justjs#136) can
// be exercised end-to-end without a real Mastodon/Bluesky/Reddit account.
// The pasted token doubles as a deliberate control: a token containing
// "fail" (case-insensitive) simulates a real rejected/failed call, so
// both the happy path and the per-provider error-isolation path (see
// core/socials_dashboard.ts's Promise.allSettled) can be exercised live
// from the real UI, not just from DI-fake unit tests.
export class TestSocialConnectProvider implements SocialConnectProvider {
  readonly concern = "socialConnect" as const;
  readonly strategy = "testsocial";

  constructor(private readonly config: BearerTokenConfig) {}

  async connect(): Promise<SocialResource[]> {
    if (!this.config.token) {
      throw new SocialConnectProviderError(
        "TOKEN_REJECTED",
        "Test Social: paste any value as the token first (this provider never contacts a real backend)."
      );
    }
    if (this.config.token.toLowerCase().includes("fail")) {
      throw new SocialConnectProviderError(
        "REQUEST_FAILED",
        `Test Social: simulated failure - the token "${this.config.token}" contains "fail".`
      );
    }
    return [
      { id: "test-1", name: "Test List Alpha", status: "active" },
      { id: "test-2", name: "Test List Beta", status: "active" },
      { id: "test-3", name: "Test List Gamma", status: "archived" },
    ];
  }

  async createPost(text: string): Promise<void> {
    if (this.config.token.toLowerCase().includes("fail")) {
      throw new SocialConnectProviderError(
        "REQUEST_FAILED",
        `Test Social: simulated posting failure - the token "${this.config.token}" contains "fail".`
      );
    }
    // Real no-op otherwise - nothing to actually post to.
  }

  weave(): void {
    // Real no-op - see api/provider.ts's SocialConnectProvider.weave() comment.
  }
}
