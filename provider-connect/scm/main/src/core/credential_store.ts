import type { CredentialStore } from "../api/credential_store.js";

// Real port of cartoon_credentials.ts's/pm_credentials.ts's/etc. exact
// storage semantics (justjs:ai-editor:<namespace>-token:<providerId> key
// shape, localStorage-only, best-effort try/catch, empty string ->
// removeItem rather than storing "") - the same 6x-duplicated shape,
// now parameterized by namespace instead of copy-pasted per provider.
export class DefaultCredentialStore implements CredentialStore {
  readonly #namespace: string;

  constructor(namespace: string) {
    this.#namespace = namespace;
  }

  #key(providerId: string): string {
    return `justjs:ai-editor:${this.#namespace}-token:${providerId}`;
  }

  get(providerId: string): string {
    try {
      return globalThis.localStorage?.getItem(this.#key(providerId)) ?? "";
    } catch {
      return "";
    }
  }

  set(providerId: string, token: string): void {
    try {
      if (token) {
        globalThis.localStorage?.setItem(this.#key(providerId), token);
      } else {
        globalThis.localStorage?.removeItem(this.#key(providerId));
      }
    } catch {
      // Best-effort only, same graceful-degradation shape as every existing copy.
    }
  }
}
