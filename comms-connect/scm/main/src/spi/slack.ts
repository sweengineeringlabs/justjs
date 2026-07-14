import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { SlackCommsConnectProvider } from "../core/slack_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Slack - real distinct always-200/ok:false response handling, not a
// DefaultCommsConnectProvider instance - see core/slack_provider.ts.
justjs.providers.register({
  concern: "commsConnect",
  strategy: "slack",
  factory: (config?: BearerTokenConfig) =>
    new SlackCommsConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
