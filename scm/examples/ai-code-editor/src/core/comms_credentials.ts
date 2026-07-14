// Mirrors scm_credentials.ts's exact storage conventions
// (justjs:ai-editor:* key prefix, localStorage-only, best-effort
// try/catch, empty string -> removeItem rather than storing "") - same
// pattern, a separate key namespace so a Slack token never collides
// with a same-named cloud/SCM provider token. All 3 communication
// providers (Slack/Discord/Microsoft Teams) use a single bearer-shaped
// token - no signing/two-field credential needed here.

function tokenStorageKey(providerId: string): string {
  return `justjs:ai-editor:comms-token:${providerId}`;
}

export function getStoredCommsToken(providerId: string): string {
  try {
    return globalThis.localStorage?.getItem(tokenStorageKey(providerId)) ?? "";
  } catch {
    return "";
  }
}

export function setStoredCommsToken(providerId: string, token: string): void {
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

// Real local preferences for Communication's own Settings screen - none
// of these are credentials, so they live in one plain JSON blob rather
// than per-field keys.
export interface CommsSettings {
  // Slack-only in the UI (see components/communication.ts) - real
  // conversations.mark call when a Slack channel's message thread is
  // opened, moving the *bot's own* read cursor (a real, honest
  // limitation - see @justjs/comms-connect's SlackCommsConnectProvider.markAsRead
  // doc comment).
  readonly autoRead: boolean;
  // Real client-side filter over each provider's own real archived
  // field (Slack's is_archived, Teams' isArchived) - Discord has no
  // real equivalent, so this has no effect there.
  readonly hideArchived: boolean;
  // 0 = off. Otherwise a real, bounded setInterval re-fetch (seconds)
  // of whichever list is currently showing.
  readonly refreshIntervalSeconds: number;
  // "" = none (always show the provider grid first). Otherwise a real
  // provider id to jump straight into on connectedCallback().
  readonly defaultProviderId: string;
}

const DEFAULT_COMMS_SETTINGS: CommsSettings = {
  autoRead: false,
  hideArchived: false,
  refreshIntervalSeconds: 0,
  defaultProviderId: "",
};

const COMMS_SETTINGS_STORAGE_KEY = "justjs:ai-editor:comms-settings";

export function getStoredCommsSettings(): CommsSettings {
  try {
    const raw = globalThis.localStorage?.getItem(COMMS_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_COMMS_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<CommsSettings>;
    return {
      autoRead: parsed.autoRead ?? DEFAULT_COMMS_SETTINGS.autoRead,
      hideArchived: parsed.hideArchived ?? DEFAULT_COMMS_SETTINGS.hideArchived,
      refreshIntervalSeconds: parsed.refreshIntervalSeconds ?? DEFAULT_COMMS_SETTINGS.refreshIntervalSeconds,
      defaultProviderId: parsed.defaultProviderId ?? DEFAULT_COMMS_SETTINGS.defaultProviderId,
    };
  } catch {
    return DEFAULT_COMMS_SETTINGS;
  }
}

export function setStoredCommsSettings(settings: CommsSettings): void {
  try {
    globalThis.localStorage?.setItem(COMMS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Best-effort only, same graceful-degradation shape as ai_assist.ts.
  }
}
