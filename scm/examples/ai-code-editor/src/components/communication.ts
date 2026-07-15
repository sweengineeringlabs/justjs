// Discord is the only one of the 3 real, official brand marks
// (CC0, offline) available in simple-icons' catalog - Slack and
// Microsoft Teams aren't (same real gap AWS/Azure/Heroku hit in
// workspace.ts's CLOUD_PROVIDER_CATALOG - major, commercially
// protective brands not in simple-icons at all). Slack/Teams fall back
// to a plain colored monogram instead of a fabricated logo shape.
import discordLogo from "simple-icons/icons/discord.svg?raw";
import { getStoredCommsToken, setStoredCommsToken, getStoredCommsSettings, setStoredCommsSettings } from "../core/comms_credentials.js";
import type { CommsSettings } from "../core/comms_credentials.js";
import {
  connectSlack,
  connectDiscord,
  connectTeams,
  markSlackRead,
  listDiscordChannels,
  listDiscordMessages,
  listTeamsChannels,
  listTeamsMessages,
  listSlackMessages,
} from "../core/comms_connect.js";
import type { CommsResource, CommsMessage } from "../core/comms_connect.js";
import "./comms_connector.js";
import type { CommsCatalogItem, CommsConnectorControl } from "./comms_connector.js";
import { CommunicationBase } from "../features/communication/communication_component.gen.js";

interface CommsProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly logo?: string;
  // Real command the user runs locally to get a token - only Microsoft
  // Teams needs this (a short-lived CLI-issued token, matching Azure's
  // own pattern in workspace.ts's Cloud connect screens). Shown
  // verbatim in the connect form, along with the token's real expiry.
  readonly tokenHint?: { readonly command: string; readonly expiry: string };
  // "channels" - Slack's own connect() already returns real channels
  // directly; opening one goes straight to its real message thread.
  // "guildsOrTeams" - Discord's/Teams' own connect() returns the
  // top-level guild/team, one real level shallower than a channel -
  // opening one shows a real channel list first (listChannels()),
  // *then* a message thread.
  readonly kind: "channels" | "guildsOrTeams";
}

// A real, recognizable set of actual communication providers - not a
// free-text "type any name" list. All 3 use a single pasted bearer-
// shaped token (a real bot token or CLI-issued access token), same
// security posture as the Anthropic key.
const COMMS_PROVIDER_CATALOG: readonly CommsProvider[] = [
  { id: "slack", name: "Slack", icon: "💬", color: "#4A154B", kind: "channels" },
  { id: "discord", name: "Discord", icon: "🎮", color: "#5865F2", logo: discordLogo, kind: "guildsOrTeams" },
  {
    id: "teams",
    name: "Microsoft Teams",
    icon: "👥",
    color: "#6264A7",
    tokenHint: { command: "az account get-access-token --resource-type ms-graph --query accessToken -o tsv", expiry: "~60-90 minutes" },
    kind: "guildsOrTeams",
  },
];

const COMMS_CONNECTORS: Record<string, (token: string) => Promise<CommsResource[]>> = {
  slack: connectSlack,
  discord: connectDiscord,
  teams: connectTeams,
};

// Discord/Teams only (see CommsProvider.kind) - lists real channels
// within a selected guild/team.
const COMMS_CHANNEL_LISTERS: Record<string, (token: string, parentId: string) => Promise<CommsResource[]>> = {
  discord: listDiscordChannels,
  teams: listTeamsChannels,
};

// All 3 providers - lists a real channel's real recent messages.
// Teams' own listMessages needs the real parent team id too (its
// message endpoint has no channel-only shape) - the other two ignore
// the 3rd arg.
const COMMS_MESSAGE_LISTERS: Record<string, (token: string, channelId: string, parentId: string) => Promise<CommsMessage[]>> = {
  slack: (token, channelId) => listSlackMessages(token, channelId),
  discord: (token, channelId) => listDiscordMessages(token, channelId),
  teams: (token, channelId, parentId) => listTeamsMessages(token, channelId, parentId),
};

// <control-comms-connector> (justjs#120, app-local sibling to
// control-provider-connector/control-cloud-connector) covers the real
// connect/channel/message drill-down. CommsResource{id,name,status,
// archived?} already fits ListItem's shape structurally; CommsMessage
// {id,author,text,timestamp} genuinely doesn't (a chat-message shape,
// not name/status) - mapped explicitly below, same "author: text" in
// name / timestamp in status layout the original's own hand-rolled
// rows already used (checked directly, not assumed).
function toCommsCatalogItem(p: CommsProvider): CommsCatalogItem {
  return {
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    ...(p.logo !== undefined ? { logo: p.logo } : {}),
    connected: getStoredCommsToken(p.id).length > 0,
    fields: [{ id: "token", type: "password", placeholder: `Paste your ${p.name} token` }],
    disclosure: `Stored only on this device. Sent directly to ${p.name} when you connect.`,
    ...(p.tokenHint !== undefined ? { tokenHint: p.tokenHint } : {}),
    resourceListLabel: p.kind === "channels" ? "Channels" : "Teams / Servers",
    ...(p.kind === "guildsOrTeams" ? { hasChannelList: true } : {}),
  };
}

function applyCommsArchivedFilter(list: readonly CommsResource[], hideArchived: boolean): readonly CommsResource[] {
  return hideArchived ? list.filter((r) => !r.archived) : list;
}

async function handleCommsConnect(providerId: string, values: Readonly<Record<string, string>>): Promise<CommsResource[]> {
  const provider = COMMS_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  const token = (values["token"] ?? "").trim() || getStoredCommsToken(providerId);
  if (!token) {
    throw new Error("Paste a token first.");
  }
  const resources = await COMMS_CONNECTORS[providerId]!(token);
  setStoredCommsToken(providerId, token);
  return resources;
}

function handleCommsDisconnect(providerId: string): void {
  setStoredCommsToken(providerId, "");
}

// Communication - the 6th top-level tab. Real connect screens for
// Slack/Discord/Microsoft Teams, a real per-channel message thread, and
// a real Settings screen (gear icon on the provider grid) - auto-read
// (Slack only, a real conversations.mark call), hide-archived (Slack/
// Teams' own real archived fields), an auto-refresh interval, and a
// default provider on open. All 4 settings are real and self-contained
// in this component - none of them fake a capability a provider
// doesn't really have.
//
// Extends CommunicationBase (justweb-generated, justjs#120) for real
// value now that the actual connect/channel/message drill-down is
// entirely owned by <control-comms-connector>, composed as one static,
// bind-once element - same "control owns every subsequent internal
// transition" shape socials.ts's own real migration established.
// Settings is the one other top-level state, a permanent sibling
// toggled via `hidden` (justjs#127's own precedent) rather than a
// third custom-element mount, since it's a real, genuinely static form
// (both <select>'s options are compile-time-known catalogs, hardcoded
// directly). See justjs#113's shared note for why customElement.tagName
// is deliberately not set (CommunicationBase self-registers under its
// harmless default js-communication; CommunicationElement keeps its
// own explicit x-communication registration).
export class CommunicationElement extends CommunicationBase {
  private settings: CommsSettings = getStoredCommsSettings();

  connectedCallback(): void {
    this.innerHTML = `
      <div id="comms-main-view" data-part="main-view">
        <div class="dash-subnav">
          <h2 class="workspace-stage-title">📣 Communication</h2>
          <button id="comms-settings-btn" data-part="settings-btn" class="dash-back-btn" type="button" aria-label="Communication settings">⚙️ Settings</button>
        </div>
        <p class="connect-hint">Tap a provider to connect a real account and see its actual channels/teams. Tokens are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
        <control-comms-connector id="comms-connector" data-part="connector"></control-comms-connector>
      </div>
      <div id="comms-settings-view" data-part="settings-view" hidden>
        <div class="dash-subnav">
          <button id="comms-settings-back-btn" data-part="settings-back-btn" class="dash-back-btn" type="button">← Communication</button>
          <h2 class="workspace-stage-title">⚙️ Settings</h2>
        </div>
        <div class="connect-form">
          <label class="field">
            <input id="comms-setting-auto-read" data-part="setting-auto-read" type="checkbox" />
            <span class="field-label">Slack: automatically mark a channel read when you open it</span>
          </label>
          <p class="connect-hint">Calls Slack's real conversations.mark - moves the bot's own read cursor for the channel, not a human user's (this app connects as a bot, which has no way to mark read-state on a person's behalf). Has no effect for Discord/Teams - neither has any real read-state a bot/app token can see or set.</p>

          <label class="field">
            <input id="comms-setting-hide-archived" data-part="setting-hide-archived" type="checkbox" />
            <span class="field-label">Slack &amp; Teams: hide archived channels</span>
          </label>
          <p class="connect-hint">Filters out channels Slack's/Teams' own API reports as archived. Has no effect for Discord - it has no real archived concept for a bot token.</p>

          <label class="field">
            <span class="field-label">Auto-refresh</span>
            <select id="comms-setting-refresh-interval" data-part="setting-refresh-interval">
              <option value="0">Off</option>
              <option value="30">Every 30s</option>
              <option value="60">Every 60s</option>
              <option value="120">Every 2 min</option>
            </select>
          </label>
          <p class="connect-hint">Periodically re-fetches whichever list is on screen (channels or messages) - stops as soon as you leave that screen.</p>

          <label class="field">
            <span class="field-label">Default provider on open</span>
            <select id="comms-setting-default-provider" data-part="setting-default-provider">
              <option value="">None - always show the provider grid</option>
              <option value="slack">Slack</option>
              <option value="discord">Discord</option>
              <option value="teams">Microsoft Teams</option>
            </select>
          </label>
        </div>
      </div>
    `;
    // Binds this.mainView/settingsBtn/connector/settingsView/
    // settingsBackBtn/settingAutoRead/settingHideArchived/
    // settingRefreshInterval/settingDefaultProvider via real data-part
    // lookups - must run after the markup above exists, since
    // CommunicationBase's own connectedCallback() calls
    // _bindElements() synchronously.
    super.connectedCallback();

    this.settingAutoRead.checked = this.settings.autoRead;
    this.settingHideArchived.checked = this.settings.hideArchived;
    this.settingRefreshInterval.value = String(this.settings.refreshIntervalSeconds);
    this.settingDefaultProvider.value = this.settings.defaultProviderId;

    this.settingsBtn.addEventListener("click", () => {
      this.mainView.hidden = true;
      this.settingsView.hidden = false;
    });
    this.settingsBackBtn.addEventListener("click", () => {
      this.settingsView.hidden = true;
      this.mainView.hidden = false;
    });

    const persist = (partial: Partial<CommsSettings>): void => {
      this.settings = { ...this.settings, ...partial };
      setStoredCommsSettings(this.settings);
    };
    this.settingAutoRead.addEventListener("change", () => persist({ autoRead: this.settingAutoRead.checked }));
    this.settingHideArchived.addEventListener("change", () => persist({ hideArchived: this.settingHideArchived.checked }));
    this.settingRefreshInterval.addEventListener("change", () => {
      const seconds = Number(this.settingRefreshInterval.value);
      persist({ refreshIntervalSeconds: seconds });
      (this.connector as CommsConnectorControl).refreshIntervalSeconds = seconds;
    });
    this.settingDefaultProvider.addEventListener("change", () => persist({ defaultProviderId: this.settingDefaultProvider.value }));

    const connector = this.connector as CommsConnectorControl;
    connector.providers = COMMS_PROVIDER_CATALOG.map(toCommsCatalogItem);
    connector.connect = handleCommsConnect;
    connector.list = async (_providerId, session) => applyCommsArchivedFilter(session as CommsResource[], this.settings.hideArchived);
    connector.disconnect = handleCommsDisconnect;
    connector.listChannels = async (providerId, parentId) => {
      const token = getStoredCommsToken(providerId);
      const channels = await COMMS_CHANNEL_LISTERS[providerId]!(token, parentId);
      return applyCommsArchivedFilter(channels, this.settings.hideArchived);
    };
    connector.listMessages = async (providerId, channelId, parentId) => {
      const token = getStoredCommsToken(providerId);
      const messages = await COMMS_MESSAGE_LISTERS[providerId]!(token, channelId, parentId);
      // Real, Slack-only auto-read (see Settings) - marks the bot's own
      // read cursor up to the newest message (Slack's conversations.history
      // returns newest-first by default, matching Discord's own
      // confirmed convention).
      if (providerId === "slack" && this.settings.autoRead && messages.length > 0) {
        try {
          await markSlackRead(token, channelId, messages[0]!.timestamp);
        } catch {
          // Real, best-effort only - a failed auto-read call shouldn't
          // block or error out an otherwise-successful message fetch.
        }
      }
      return messages.map((m) => ({ id: m.id, name: `${m.author}: ${m.text}`, status: m.timestamp }));
    };
    connector.catalogLabel = "Communication";
    connector.refreshIntervalSeconds = this.settings.refreshIntervalSeconds;

    // Real "default provider on open" - jumps straight to that
    // provider's own connect screen instead of the grid.
    if (this.settings.defaultProviderId) {
      connector.openProvider(this.settings.defaultProviderId);
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-communication")) {
  customElements.define("x-communication", CommunicationElement);
}
