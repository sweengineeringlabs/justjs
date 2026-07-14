import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { TeamsCommsConnectProvider } from "../core/teams_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Microsoft Teams - real distinct logic (real listChannels()/
// listMessages() beyond the generic engine's connect()), not a plain
// DefaultCommsConnectProvider instance - see core/teams_provider.ts.
justjs.providers.register({
  concern: "commsConnect",
  strategy: "teams",
  factory: (config?: BearerTokenConfig) =>
    new TeamsCommsConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
