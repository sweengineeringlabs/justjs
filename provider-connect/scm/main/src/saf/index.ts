import type { CredentialStore } from "../api/credential_store.js";
import { DefaultCredentialStore } from "../core/credential_store.js";

export type { CredentialStore } from "../api/credential_store.js";

export function createCredentialStore(namespace: string): CredentialStore {
  return new DefaultCredentialStore(namespace);
}
