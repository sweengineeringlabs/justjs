import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { TrelloPmConnectProvider } from "../core/trello_provider.js";
import type { TrelloCredentialsConfig } from "../api/provider.js";

justjs.providers.register({
  concern: "pmConnect",
  strategy: "trello",
  factory: (config?: TrelloCredentialsConfig) =>
    new TrelloPmConnectProvider(config ?? { apiKey: "", token: "" }, createApiAdapter(createFetchAdapter())),
});
