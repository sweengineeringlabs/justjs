import { justjs } from "@justjs/application";
import { createApiAdapter } from "@justjs/transport";
import { createFetchAdapter } from "@justjs/network";
import { AwsCloudProvisioningProvider } from "../core/aws_cloud_provisioning_provider.js";
import type { AwsCredentialsConfig } from "../api/provider.js";

// AWS CloudWatch + EC2 provisioning (justjs#144/ADR-0017) - real SigV4-
// signed requests, same signing engine as cloudConnect's own "aws"
// strategy. Separate concern ("cloudProvisioning") since this is
// action-taking, not credential verification - see api/provisioning.ts's
// own comment for why this isn't folded into CloudConnectProvider.
justjs.providers.register({
  concern: "cloudProvisioning",
  strategy: "aws",
  factory: (config?: AwsCredentialsConfig) =>
    new AwsCloudProvisioningProvider(config ?? { accessKeyId: "", secretAccessKey: "" }, createApiAdapter(createFetchAdapter())),
});
