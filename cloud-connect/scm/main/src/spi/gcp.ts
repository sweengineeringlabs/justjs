import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultCloudConnectProvider } from "../core/default_cloud_connect_provider.js";
import type { BearerProviderDescriptor } from "../core/default_cloud_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Token comes from `gcloud auth print-access-token` (real ~1hr expiry -
// same "show the real command and expiry" treatment as Azure).
export const GCP_PROVIDER: BearerProviderDescriptor = {
  strategy: "gcp",
  name: "Google Cloud",
  url: "https://cloudresourcemanager.googleapis.com/v1/projects",
  parse: (data) =>
    ((data as { projects?: Array<{ projectId: string; name: string; lifecycleState: string }> }).projects ?? []).map(
      (p) => ({ id: p.projectId, name: p.name, status: p.lifecycleState })
    ),
};

justjs.providers.register({
  concern: "cloudConnect",
  strategy: "gcp",
  factory: (config?: BearerTokenConfig) =>
    new DefaultCloudConnectProvider(GCP_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
