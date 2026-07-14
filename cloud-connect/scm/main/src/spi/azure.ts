import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultCloudConnectProvider } from "../core/default_cloud_connect_provider.js";
import type { BearerProviderDescriptor } from "../core/default_cloud_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Token comes from `az account get-access-token --query accessToken -o
// tsv` (real ~60-90min expiry) - consumers should show this exact
// command and expiry in their own connect UI, not hide the requirement.
export const AZURE_PROVIDER: BearerProviderDescriptor = {
  strategy: "azure",
  name: "Azure",
  url: "https://management.azure.com/subscriptions?api-version=2022-12-01",
  parse: (data) =>
    (data as { value: Array<{ subscriptionId: string; displayName: string; state: string }> }).value.map((s) => ({
      id: s.subscriptionId,
      name: s.displayName,
      status: s.state,
    })),
};

justjs.providers.register({
  concern: "cloudConnect",
  strategy: "azure",
  factory: (config?: BearerTokenConfig) =>
    new DefaultCloudConnectProvider(AZURE_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
