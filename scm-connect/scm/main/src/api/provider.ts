import type { AspectTarget } from "@justjs/application";

// A real repository returned by a provider's own real list API. `status`
// is the repo's real visibility ("private"/"public") - kept identical in
// shape to @justjs/cloud-connect's CloudResource on purpose, so a
// consuming app's UI markup/CSS can be shared across both concerns
// rather than coincidentally similar.
export interface ScmResource {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

// All 3 real providers (GitHub/GitLab/Bitbucket) use a single bearer
// token - a real Personal Access Token, sent as `Authorization: Bearer
// <token>`. No provider here needs anything more complex (no AWS-style
// signing in this concern).
export interface BearerTokenConfig {
  readonly token: string;
}

export interface ScmConnectProvider {
  readonly concern: "scmConnect";
  readonly strategy: string;
  // Proves the token actually works and returns the account's real
  // repositories.
  connect(): Promise<ScmResource[]>;
  // Real no-op, required by boot()'s `spec.factory().weave(target)`
  // call for every concern actually listed in the `aspects` config it's
  // given (application/scm/main/src/core/boot.ts) - scmConnect isn't a
  // rendering-pipeline concern with anything to weave into a route/
  // component target, but the method must exist on whatever a
  // registered factory returns, same as CloudConnectProvider.weave().
  weave(target: AspectTarget): void;
}

export class ScmConnectProviderError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ScmConnectProviderError";
  }
}
