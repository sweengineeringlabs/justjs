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
import { COMMS_PROVIDER_CATALOG } from "../core/comms_catalog.js";
import type { CommsProvider } from "../core/comms_catalog.js";
import { fetchCommsDashboard } from "../core/comms_dashboard.js";
import "./comms_connector.js";
import type { CommsCatalogItem, CommsConnectorControl } from "./comms_connector.js";
import { CommunicationBase } from "../features/communication/communication_component.gen.js";

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
  private dashboardBtn!: HTMLButtonElement;
  private dashboardView!: HTMLElement;
  private dashboardBackBtn!: HTMLButtonElement;
  private dashboardList!: HTMLElement;

  connectedCallback(): void {
    this.innerHTML = `
      <div id="comms-main-view" data-part="main-view">
        <div class="dash-subnav">
          <h2 class="workspace-stage-title">📣 Communication</h2>
          <button id="comms-dashboard-btn" class="btn-secondary" type="button">📊 Dashboard</button>
          <button id="comms-settings-btn" data-part="settings-btn" class="dash-back-btn" type="button" aria-label="Communication settings">⚙️ Settings</button>
        </div>
        <p class="connect-hint">Tap a provider to connect a real account and see its actual channels/teams. Tokens are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
        <control-comms-connector id="comms-connector" data-part="connector"></control-comms-connector>
      </div>
      <div id="comms-dashboard-view" hidden>
        <div class="dash-subnav">
          <button id="comms-dashboard-back-btn" class="dash-back-btn" type="button">← Communication</button>
          <h2 class="workspace-stage-title">📊 Dashboard</h2>
        </div>
        <p class="connect-hint">Real data from every connected Comms provider, merged into one place - not a replacement for the provider grid, just another way to see what's already there.</p>
        <div id="comms-dashboard-list"></div>
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

    this.dashboardBtn = this.querySelector<HTMLButtonElement>("#comms-dashboard-btn")!;
    this.dashboardView = this.querySelector<HTMLElement>("#comms-dashboard-view")!;
    this.dashboardBackBtn = this.querySelector<HTMLButtonElement>("#comms-dashboard-back-btn")!;
    this.dashboardList = this.querySelector<HTMLElement>("#comms-dashboard-list")!;
    this.dashboardBtn.addEventListener("click", () => this.showDashboard());
    this.dashboardBackBtn.addEventListener("click", () => {
      this.dashboardView.hidden = true;
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

  // Rebuilt fresh every time Dashboard is opened - real data, not a
  // stale cache, same "no reload needed after disconnecting a provider"
  // guarantee Connect → Agent's own config screen already established.
  private showDashboard(): void {
    this.mainView.hidden = true;
    this.dashboardView.hidden = false;
    this.dashboardList.innerHTML = `<p class="connect-hint">Loading…</p>`;
    void fetchCommsDashboard().then((result) => this.renderDashboard(result));
  }

  private renderDashboard(result: Awaited<ReturnType<typeof fetchCommsDashboard>>): void {
    if (result.entries.length === 0 && result.errors.length === 0) {
      this.dashboardList.innerHTML = `<p class="connect-hint">Nothing connected yet - connect a provider above to see its real data here.</p>`;
      return;
    }
    const byProvider = new Map<string, { name: string; icon: string; items: (typeof result.entries)[number][] }>();
    for (const entry of result.entries) {
      const group = byProvider.get(entry.providerId) ?? { name: entry.providerName, icon: entry.providerIcon, items: [] };
      group.items.push(entry);
      byProvider.set(entry.providerId, group);
    }
    const groupsHtml = Array.from(byProvider.values())
      .map(
        (group) => `
          <p class="field-label">${group.icon} ${group.name}</p>
          ${group.items.map((e) => `<p class="agent-step">${e.resource.name} — ${e.resource.status}</p>`).join("")}
        `
      )
      .join("");
    const errorsHtml = result.errors.map((e) => `<p class="agent-step agent-step-error">⚠️ ${e.providerName}: ${e.message}</p>`).join("");
    this.dashboardList.innerHTML = groupsHtml + errorsHtml;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-communication")) {
  customElements.define("x-communication", CommunicationElement);
}
