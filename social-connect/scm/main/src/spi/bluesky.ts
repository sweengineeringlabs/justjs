import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { BlueskySocialConnectProvider } from "../core/bluesky_provider.js";
import type { AppPasswordConfig } from "../api/provider.js";

// Bluesky - real distinct 2-step session-exchange logic, not a
// DefaultSocialConnectProvider instance - see core/bluesky_provider.ts.
justjs.providers.register({
  concern: "socialConnect",
  strategy: "bluesky",
  factory: (config?: AppPasswordConfig) =>
    new BlueskySocialConnectProvider(config ?? { identifier: "", appPassword: "" }, createApiAdapter(createFetchAdapter())),
});
