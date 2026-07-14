import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultCommsConnectProvider } from "../core/default_comms_connect_provider.js";
import type { CommsProviderDescriptor } from "../core/default_comms_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Token comes from `az account get-access-token --resource-type
// ms-graph --query accessToken -o tsv` (a real, documented Azure CLI
// command) - same short-lived-CLI-token pattern @justjs/cloud-connect's
// Azure provider already uses, consumers should show this exact command
// and the token's real expiry in their own connect UI.
export const TEAMS_PROVIDER: CommsProviderDescriptor = {
  strategy: "teams",
  name: "Microsoft Teams",
  url: "https://graph.microsoft.com/v1.0/me/joinedTeams",
  parse: (data) =>
    (data as { value: Array<{ id: string; displayName: string; visibility?: string }> }).value.map((t) => ({
      id: t.id,
      name: t.displayName,
      status: t.visibility ?? "unknown",
    })),
};

justjs.providers.register({
  concern: "commsConnect",
  strategy: "teams",
  factory: (config?: BearerTokenConfig) =>
    new DefaultCommsConnectProvider(TEAMS_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
