import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { HerokuCloudConnectProvider } from "../core/heroku_provider.js";
import type { BearerTokenConfig } from "../api/provider.js";

// Heroku - real distinct deploy logic (a real gzipped-tarball build
// flow), not a plain DefaultCloudConnectProvider instance - see
// core/heroku_provider.ts.
justjs.providers.register({
  concern: "cloudConnect",
  strategy: "heroku",
  factory: (config?: BearerTokenConfig) =>
    new HerokuCloudConnectProvider(config ?? { token: "" }, createApiAdapter(createFetchAdapter())),
});
