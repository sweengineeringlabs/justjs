// Mirrors ai_assist.ts's exact storage conventions (justjs:ai-editor:*
// key prefix, localStorage-only, best-effort try/catch, empty string ->
// removeItem rather than storing "") - not a new pattern, the same one
// extended to 7 more providers. 6 providers (DigitalOcean/Netlify/
// Vercel/Heroku/Azure/GCP) use a single bearer token; AWS needs a real
// access-key-id + secret-access-key pair instead, stored as one JSON
// blob under its own key.

export interface AwsCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

function tokenStorageKey(providerId: string): string {
  return `justjs:ai-editor:cloud-token:${providerId}`;
}

// The real site/project/app identifier a provider's own deploy()
// returned as `targetId` after the *first* successful deploy - reused
// on every later deploy so it updates the same live target instead of
// creating a new one every click (real "redeploy" semantics, matching
// how the Netlify/Vercel/Heroku CLIs themselves behave). Netlify/Heroku
// specifically need this (their create call always makes something
// new); Vercel's own project name naturally upserts, but still benefits
// from staying stable across visits.
function deployTargetStorageKey(providerId: string): string {
  return `justjs:ai-editor:cloud-deploy-target:${providerId}`;
}

const AWS_CREDENTIALS_STORAGE_KEY = "justjs:ai-editor:aws-credentials";

export function getStoredCloudToken(providerId: string): string {
  try {
    return globalThis.localStorage?.getItem(tokenStorageKey(providerId)) ?? "";
  } catch {
    return "";
  }
}

export function setStoredCloudToken(providerId: string, token: string): void {
  try {
    if (token) {
      globalThis.localStorage?.setItem(tokenStorageKey(providerId), token);
    } else {
      globalThis.localStorage?.removeItem(tokenStorageKey(providerId));
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}

export function getStoredAwsCredentials(): AwsCredentials | null {
  try {
    const raw = globalThis.localStorage?.getItem(AWS_CREDENTIALS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AwsCredentials>;
    if (!parsed.accessKeyId || !parsed.secretAccessKey) {
      return null;
    }
    return { accessKeyId: parsed.accessKeyId, secretAccessKey: parsed.secretAccessKey };
  } catch {
    return null;
  }
}

export function setStoredAwsCredentials(credentials: AwsCredentials | null): void {
  try {
    if (credentials && credentials.accessKeyId && credentials.secretAccessKey) {
      globalThis.localStorage?.setItem(AWS_CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
    } else {
      globalThis.localStorage?.removeItem(AWS_CREDENTIALS_STORAGE_KEY);
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}

export function getStoredCloudDeployTarget(providerId: string): string | null {
  try {
    return globalThis.localStorage?.getItem(deployTargetStorageKey(providerId)) ?? null;
  } catch {
    return null;
  }
}

export function setStoredCloudDeployTarget(providerId: string, targetId: string): void {
  try {
    globalThis.localStorage?.setItem(deployTargetStorageKey(providerId), targetId);
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}
