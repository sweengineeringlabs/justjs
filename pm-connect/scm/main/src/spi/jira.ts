import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { JiraPmConnectProvider } from "../core/jira_provider.js";
import type { JiraSessionConfig } from "../api/provider.js";

justjs.providers.register({
  concern: "pmConnect",
  strategy: "jira",
  factory: (config?: JiraSessionConfig) =>
    new JiraPmConnectProvider(config ?? { accessToken: "", cloudId: "" }, createApiAdapter(createFetchAdapter())),
});
