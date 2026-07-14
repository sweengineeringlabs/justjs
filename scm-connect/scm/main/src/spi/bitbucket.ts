import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { BitbucketScmConnectProvider } from "../core/bitbucket_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Bitbucket - real distinct two-call logic (workspaces, then the first
// workspace's repos), not a DefaultScmConnectProvider instance - see
// core/bitbucket_provider.ts for why.
justjs.providers.register({
  concern: "scmConnect",
  strategy: "bitbucket",
  factory: (config?: BearerTokenConfig) =>
    new BitbucketScmConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
