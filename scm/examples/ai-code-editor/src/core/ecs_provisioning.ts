// Thin app-local adapter over @justjs/cloud-connect's "cloudProvisioning"
// concern's ECS method group (justjs#144/ADR-0017's ECS phase) - same
// role core/ec2_provisioning.ts plays for EC2.
import { createCloudProvisioningProvider } from "@justjs/cloud-connect";
import type { EcsClusterState, EcsTaskDefinitionConfig, EcsTaskDefinitionState, EcsTaskState } from "@justjs/cloud-connect";

export type { EcsClusterState, EcsTaskDefinitionConfig, EcsTaskDefinitionState, EcsTaskState };

export function createAwsEcsCluster(accessKeyId: string, secretAccessKey: string, clusterName: string): Promise<EcsClusterState> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).createEcsCluster!(clusterName);
}

export function listAwsEcsClusters(accessKeyId: string, secretAccessKey: string): Promise<readonly EcsClusterState[]> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).listEcsClusters!();
}

export function deleteAwsEcsCluster(accessKeyId: string, secretAccessKey: string, clusterName: string): Promise<void> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).deleteEcsCluster!(clusterName);
}

export function registerAwsEcsTaskDefinition(
  accessKeyId: string,
  secretAccessKey: string,
  config: EcsTaskDefinitionConfig
): Promise<EcsTaskDefinitionState> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).registerEcsTaskDefinition!(config);
}

export function deregisterAwsEcsTaskDefinition(accessKeyId: string, secretAccessKey: string, taskDefinitionArn: string): Promise<void> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).deregisterEcsTaskDefinition!(taskDefinitionArn);
}

export function runAwsEcsTask(
  accessKeyId: string,
  secretAccessKey: string,
  clusterName: string,
  taskDefinitionArn: string
): Promise<readonly EcsTaskState[]> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).runEcsTask!(clusterName, taskDefinitionArn);
}

export function listAwsEcsTasks(accessKeyId: string, secretAccessKey: string, clusterName: string): Promise<readonly EcsTaskState[]> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).listEcsTasks!(clusterName);
}

export function stopAwsEcsTask(accessKeyId: string, secretAccessKey: string, clusterName: string, taskArn: string): Promise<void> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).stopEcsTask!(clusterName, taskArn);
}
