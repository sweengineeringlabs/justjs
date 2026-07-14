import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DiscordCommsConnectProvider } from "../core/discord_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Discord - real distinct logic (real listChannels()/listMessages()
// beyond the generic engine's connect()), not a plain
// DefaultCommsConnectProvider instance - see core/discord_provider.ts.
justjs.providers.register({
  concern: "commsConnect",
  strategy: "discord",
  factory: (config?: BearerTokenConfig) =>
    new DiscordCommsConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
