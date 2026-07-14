import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultCommsConnectProvider } from "../core/default_comms_connect_provider.js";
import type { CommsProviderDescriptor } from "../core/default_comms_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

export const DISCORD_PROVIDER: CommsProviderDescriptor = {
  strategy: "discord",
  name: "Discord",
  url: "https://discord.com/api/v10/users/@me/guilds",
  // Discord's own documented convention for bot tokens - not "Bearer"
  // (that scheme is for OAuth user tokens instead).
  authScheme: "Bot",
  parse: (data) =>
    (data as Array<{ id: string; name: string; owner?: boolean }>).map((g) => ({
      id: g.id,
      name: g.name,
      status: g.owner ? "owner" : "member",
    })),
};

justjs.providers.register({
  concern: "commsConnect",
  strategy: "discord",
  factory: (config?: BearerTokenConfig) =>
    new DefaultCommsConnectProvider(DISCORD_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
