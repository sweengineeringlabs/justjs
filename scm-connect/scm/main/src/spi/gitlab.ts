import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { DefaultScmConnectProvider } from "../core/default_scm_connect_provider.js";
import type { ScmProviderDescriptor } from "../core/default_scm_connect_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

export const GITLAB_PROVIDER: ScmProviderDescriptor = {
  strategy: "gitlab",
  name: "GitLab",
  url: "https://gitlab.com/api/v4/projects?membership=true",
  parse: (data) =>
    (data as Array<{ id: number; path_with_namespace: string; visibility: string }>).map((p) => ({
      id: String(p.id),
      name: p.path_with_namespace,
      status: p.visibility,
    })),
};

justjs.providers.register({
  concern: "scmConnect",
  strategy: "gitlab",
  factory: (config?: BearerTokenConfig) =>
    new DefaultScmConnectProvider(GITLAB_PROVIDER, config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
