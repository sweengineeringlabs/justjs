import type { AspectTarget } from "@justjs/application";

// A real channel/guild/team returned by a provider's own real list API.
// `status` is provider-specific vocabulary as-is (Slack's channel
// privacy, Discord's guild owner flag, Teams' visibility) - kept
// identical in shape to @justjs/cloud-connect's CloudResource /
// @justjs/scm-connect's ScmResource on purpose, so a consuming app's UI
// markup/CSS can be shared across all three concerns.
export interface CommsResource {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

// All 3 real providers (Slack/Discord/Microsoft Teams) use a single
// bearer-shaped token - a real bot token or CLI-issued access token.
// The auth header *scheme* varies (see DefaultCommsConnectProvider's
// configurable authScheme) but the credential itself is always one
// string.
export interface BearerTokenConfig {
  readonly token: string;
}

export interface CommsConnectProvider {
  readonly concern: "commsConnect";
  readonly strategy: string;
  // Proves the token actually works and returns the account's real
  // channels/guilds/teams.
  connect(): Promise<CommsResource[]>;
  // Real no-op, required by boot()'s `spec.factory().weave(target)`
  // call for every concern actually listed in the `aspects` config it's
  // given (application/scm/main/src/core/boot.ts) - commsConnect isn't
  // a rendering-pipeline concern with anything to weave into a route/
  // component target, but the method must exist on whatever a
  // registered factory returns, same as CloudConnectProvider.weave()/
  // ScmConnectProvider.weave().
  weave(target: AspectTarget): void;
}

export class CommsConnectProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "CommsConnectProviderError";
  }
}
