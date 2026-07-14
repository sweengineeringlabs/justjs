import type { AspectTarget } from "@justjs/application";

// A real issue/task/board returned by a provider's own real list API -
// `status` is provider-specific vocabulary as-is (Linear's workflow
// state name, Asana's completed/incomplete, Trello's open/closed board)
// rather than normalized, same reasoning every other *-connect
// package's own resource type already uses. Kept identical in shape to
// CloudResource/ScmResource/CommsResource/SocialResource on purpose, so
// a consuming app's UI markup/CSS can be shared across all five
// concerns.
export interface PmResource {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

// Linear and Asana both use a single bearer-shaped token - the auth
// header *scheme* differs per provider (Linear sends it with no
// "Bearer" prefix at all, confirmed live/via docs - a real, deliberate
// deviation from convention on Linear's part, not a mistake here), but
// the credential itself is always one string.
export interface BearerTokenConfig {
  readonly token: string;
}

// Trello's real auth convention is 2 query-string parameters, not a
// header - both pasted by the user from Trello's own developer pages.
export interface TrelloCredentialsConfig {
  readonly apiKey: string;
  readonly token: string;
}

// An already-established Jira OAuth session (a real access token plus
// the real Jira Cloud site id it's scoped to). Deliberately NOT the
// user's OAuth app client ID/secret - those exist only to *obtain* a
// session (see core/jira_oauth.ts's buildJiraAuthorizationUrl/
// exchangeJiraAuthorizationCode, called directly by the app around this
// provider, not through it) and are never part of a PmConnectProvider's
// own config.
export interface JiraSessionConfig {
  readonly accessToken: string;
  readonly cloudId: string;
}

export type PmConnectProviderConfig = BearerTokenConfig | TrelloCredentialsConfig | JiraSessionConfig;

export interface PmConnectProvider {
  readonly concern: "pmConnect";
  readonly strategy: string;
  // Proves the credential/session actually works and returns the
  // account's real work items - Linear's assigned issues, Asana's
  // tasks, Trello's boards, Jira's assigned issues.
  connect(): Promise<PmResource[]>;
  // Real no-op, required by boot()'s `spec.factory().weave(target)`
  // call for every concern actually listed in the `aspects` config it's
  // given (application/scm/main/src/core/boot.ts) - pmConnect isn't a
  // rendering-pipeline concern with anything to weave into a route/
  // component target, but the method must exist on whatever a
  // registered factory returns, same as every other *-connect
  // package's weave().
  weave(target: AspectTarget): void;
}

export class PmConnectProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PmConnectProviderError";
  }
}
