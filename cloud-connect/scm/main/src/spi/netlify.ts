import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { NetlifyCloudConnectProvider } from "../core/netlify_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Netlify - real distinct deploy logic (a real digest-based deploy
// flow), not a plain DefaultCloudConnectProvider instance - see
// core/netlify_provider.ts.
justjs.providers.register({
  concern: "cloudConnect",
  strategy: "netlify",
  factory: (config?: BearerTokenConfig) =>
    new NetlifyCloudConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
