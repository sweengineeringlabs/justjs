import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultScmConnectProvider } from "../core/default_scm_connect_provider.js";
import type { ScmProviderDescriptor } from "../core/default_scm_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

export const GITHUB_PROVIDER: ScmProviderDescriptor = {
  strategy: "github",
  name: "GitHub",
  url: "https://api.github.com/user/repos",
  extraHeaders: { Accept: "application/vnd.github+json" },
  parse: (data) =>
    (data as Array<{ id: number; name: string; full_name: string; private: boolean }>).map((r) => ({
      id: String(r.id),
      name: r.full_name,
      status: r.private ? "private" : "public",
    })),
};

justjs.providers.register({
  concern: "scmConnect",
  strategy: "github",
  factory: (config?: BearerTokenConfig) =>
    new DefaultScmConnectProvider(GITHUB_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
