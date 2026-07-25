import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { AwsCloudWatchProvisioningProvider } from "../core/aws_cloudwatch_provider.js";
import type { AwsCredentialsConfig } from "../api/provider.js";

// AWS CloudWatch - real SigV4-signed provisioning (alarms), same
// signing engine as cloudConnect's own "aws" strategy. Separate concern
// ("cloudProvisioning") since this is action-taking, not credential
// verification - see api/provisioning.ts's own comment for why this
// isn't folded into CloudConnectProvider.
justjs.providers.register({
  concern: "cloudProvisioning",
  strategy: "aws",
  factory: (config?: AwsCredentialsConfig) =>
    new AwsCloudWatchProvisioningProvider(config ?? { accessKeyId: "", secretAccessKey: "" }, createApiAdapter(createFetchAdapter())),
});
