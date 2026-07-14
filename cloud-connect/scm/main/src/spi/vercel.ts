import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { VercelCloudConnectProvider } from "../core/vercel_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Vercel - real distinct deploy logic (files inlined directly in one
// real deployment-creation call), not a plain DefaultCloudConnectProvider
// instance - see core/vercel_provider.ts.
justjs.providers.register({
  concern: "cloudConnect",
  strategy: "vercel",
  factory: (config?: BearerTokenConfig) =>
    new VercelCloudConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
