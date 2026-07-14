import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { AwsCloudConnectProvider } from "../core/aws_provider.js";
import type { AwsCredentialsConfig } from "../api/provider.js";

// AWS - real SigV4 request signing (core/aws_sigv4.ts) instead of a
// plain bearer token, since AWS's own docs are explicit that CORS
// support doesn't remove the signing requirement.
justjs.providers.register({
  concern: "cloudConnect",
  strategy: "aws",
  factory: (config?: AwsCredentialsConfig) =>
    new AwsCloudConnectProvider(config ?? { accessKeyId: "", secretAccessKey: "" }, createApiAdapter(createFetchAdapter())),
});
