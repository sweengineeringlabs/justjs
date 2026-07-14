// Thin app-local adapter over the real @justjs/comms-connect package -
// same role core/cloud_connect.ts/core/scm_connect.ts play for their
// own packages.
import { createCommsConnectProvider } from "@justjs/comms-connect";
import type { CommsResource } from "@justjs/comms-connect";

export type { CommsResource };

export function connectSlack(token: string): Promise<CommsResource[]> {
  return createCommsConnectProvider("slack", { token }).connect();
}

// Discord's own documented convention for bot tokens - the real
// `Authorization: Bot <token>` header (not Bearer) is applied inside
// @justjs/comms-connect, not here.
export function connectDiscord(token: string): Promise<CommsResource[]> {
  return createCommsConnectProvider("discord", { token }).connect();
}

// Token comes from `az account get-access-token --resource-type
// ms-graph --query accessToken -o tsv` - real, short-lived, same
// CLI-token pattern Azure already uses in @justjs/cloud-connect.
export function connectTeams(token: string): Promise<CommsResource[]> {
  return createCommsConnectProvider("teams", { token }).connect();
}
