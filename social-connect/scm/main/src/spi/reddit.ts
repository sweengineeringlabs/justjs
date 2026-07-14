import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { RedditSocialConnectProvider } from "../core/reddit_provider.js";
import type { ClientCredentialsConfig } from "../api/provider.js";

// Reddit - real distinct client_credentials + app-level-only logic, not
// a DefaultSocialConnectProvider instance - see core/reddit_provider.ts.
justjs.providers.register({
  concern: "socialConnect",
  strategy: "reddit",
  factory: (config?: ClientCredentialsConfig) =>
    new RedditSocialConnectProvider(config ?? { clientId: "", clientSecret: "" }, createApiAdapter(createFetchAdapter())),
});
