import { justjs } from "@justjs/application";
import { TestSocialConnectProvider } from "../core/test_social_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// A real, in-memory-only strategy - no network call, ever. Lives in the
// same spi/ as the real providers (Mastodon/Bluesky/Reddit) rather than
// behind a build flag - this package has no dev/prod build-mode
// branching precedent, and the strategy only activates if some catalog/
// UI explicitly requests strategy "testsocial", same posture as any
// other registered-but-unused strategy already sitting in this registry.
justjs.providers.register({
  concern: "socialConnect",
  strategy: "testsocial",
  factory: (config?: BearerTokenConfig) => new TestSocialConnectProvider(config ?? { token: "" }),
});
