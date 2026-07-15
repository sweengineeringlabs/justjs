export interface CredentialStore {
  get(providerId: string): string;
  set(providerId: string, token: string): void;
}
