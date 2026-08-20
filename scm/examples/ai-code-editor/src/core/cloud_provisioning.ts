// Thin app-local adapter over @justjs/cloud-connect's new
// "cloudProvisioning" concern (CloudWatch alarms - the pilot service for
// the connect->configure->deploy->monitor workflow), same role
// core/cloud_connect.ts plays for "cloudConnect".
import { createCloudProvisioningProvider } from "@justjs/cloud-connect";
import type { CloudWatchAlarmConfig, CloudWatchAlarmState, CloudWatchMetricDatapoint } from "@justjs/cloud-connect";

export type { CloudWatchAlarmConfig, CloudWatchAlarmState, CloudWatchMetricDatapoint };

export function putAwsCloudWatchAlarm(accessKeyId: string, secretAccessKey: string, config: CloudWatchAlarmConfig): Promise<void> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).putCloudWatchAlarm!(config);
}

export function listAwsCloudWatchAlarms(accessKeyId: string, secretAccessKey: string): Promise<readonly CloudWatchAlarmState[]> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).listCloudWatchAlarms!();
}

export function deleteAwsCloudWatchAlarm(accessKeyId: string, secretAccessKey: string, alarmName: string): Promise<void> {
  return createCloudProvisioningProvider("aws", { accessKeyId, secretAccessKey }).deleteCloudWatchAlarm!(alarmName);
}
