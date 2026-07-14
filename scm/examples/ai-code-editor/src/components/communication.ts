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
  listSlackMessages,
  markSlackRead,
  listDiscordChannels,
  listDiscordMessages,
  listTeamsChannels,
  listTeamsMessages,
} from "../core/comms_connect.js";
import type { CommsResource, CommsMessage } from "../core/comms_connect.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

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

// simple-icons ships each SVG with no `fill` set, meant for the
// consumer to recolor. Same treatment workspace.ts's cloud/SCM provider
// badges already use - fill="currentColor" injected here, `color:
// white` set on the wrapping badge in CSS (the already-generic
// .provider-icon rule, reused as-is - no new CSS needed).
function renderProviderBadge(p: { readonly icon?: string; readonly color: string; readonly logo?: string }): string {
  const glyph = p.logo ? p.logo.replace("<svg ", '<svg fill="currentColor" ') : escapeHtml(p.icon ?? "");
  return `<span class="provider-icon" style="background: ${p.color}">${glyph}</span>`;
}

const AUTO_REFRESH_OPTIONS: readonly { readonly seconds: number; readonly label: string }[] = [
  { seconds: 0, label: "Off" },
  { seconds: 30, label: "Every 30s" },
  { seconds: 60, label: "Every 60s" },
  { seconds: 120, label: "Every 2 min" },
];

// Communication - the 6th top-level tab. Real connect screens for
// Slack/Discord/Microsoft Teams (reusing the same generic
// .provider-*/.connect-*/.resource-* CSS classes workspace.ts's Cloud/
// Repository sections already established), a real per-channel message
// thread (Slack: channel -> messages directly; Discord/Teams: guild/
// team -> channel list -> messages, since their own connect() only
// returns the top-level guild/team), and a real Settings screen (gear
// icon on the provider grid) - auto-read (Slack only, a real
// conversations.mark call), hide-archived (Slack/Teams' own real
// archived fields), an auto-refresh interval, and a default provider on
// open. All 4 settings are real and self-contained in this component -
// none of them fake a capability a provider doesn't really have.
export class CommunicationElement extends HTMLElement {
  private selectedProviderId: string | null = null;
  // Discord/Teams only - the real guild/team id selected at level 1,
  // used to fetch level 2's channel list (and, for Teams, passed again
  // into listMessages as the required parent team id).
  private selectedParentId: string | null = null;
  private selectedChannelId: string | null = null;

  private resources: CommsResource[] | null = null;
  private connectError: string | null = null;
  private connecting = false;

  private channels: CommsResource[] | null = null;
  private channelsError: string | null = null;
  private channelsLoading = false;

  private messages: CommsMessage[] | null = null;
  private messagesError: string | null = null;
  private messagesLoading = false;

  private showSettings = false;
  private settings: CommsSettings = getStoredCommsSettings();
  private refreshTimerId: ReturnType<typeof setInterval> | null = null;

  connectedCallback(): void {
    if (this.settings.defaultProviderId) {
      this.selectedProviderId = this.settings.defaultProviderId;
    }
    this.renderView();
  }

  disconnectedCallback(): void {
    this.clearAutoRefresh();
  }

  private clearAutoRefresh(): void {
    if (this.refreshTimerId !== null) {
      clearInterval(this.refreshTimerId);
      this.refreshTimerId = null;
    }
  }

  // Real, bounded periodic re-fetch of whichever list is currently
  // showing - always cleared first (never stacks timers), and only
  // armed at all when the user has a real interval configured.
  private scheduleAutoRefresh(refetch: () => void): void {
    this.clearAutoRefresh();
    if (this.settings.refreshIntervalSeconds > 0) {
      this.refreshTimerId = setInterval(refetch, this.settings.refreshIntervalSeconds * 1000);
    }
  }

  private renderView(): void {
    if (this.showSettings) {
      this.renderSettings();
      return;
    }
    if (this.selectedProviderId) {
      const provider = COMMS_PROVIDER_CATALOG.find((p) => p.id === this.selectedProviderId);
      if (provider) {
        if (this.selectedChannelId) {
          this.renderMessageThread(provider);
          return;
        }
        if (provider.kind === "guildsOrTeams" && this.selectedParentId) {
          this.renderChannelList(provider);
          return;
        }
        this.renderDetail(provider);
        return;
      }
      this.selectedProviderId = null;
    }
    this.renderGrid();
  }

  private isProviderConnected(p: CommsProvider): boolean {
    return getStoredCommsToken(p.id).length > 0;
  }

  private renderGrid(): void {
    this.clearAutoRefresh();
    this.innerHTML = `
      <div class="dash-subnav">
        <h2 class="workspace-stage-title">📣 Communication</h2>
        <button id="comms-settings-btn" class="dash-back-btn" type="button" aria-label="Communication settings">⚙️ Settings</button>
      </div>
      <p class="connect-hint">Tap a provider to connect a real account and see its actual channels/teams. Tokens are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
      <div class="provider-grid">
        ${COMMS_PROVIDER_CATALOG.map((p) => {
          const connected = this.isProviderConnected(p);
          return `
            <button type="button" class="provider-card${connected ? " selected" : ""}" data-comms-provider-id="${p.id}">
              ${renderProviderBadge(p)}
              <span class="provider-name">${escapeHtml(p.name)}</span>
              <span class="provider-check">${connected ? "✓ Connected" : ""}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;

    this.querySelector("#comms-settings-btn")?.addEventListener("click", () => {
      this.showSettings = true;
      this.renderView();
    });
    this.querySelectorAll<HTMLButtonElement>("[data-comms-provider-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.commsProviderId;
        if (!id) {
          return;
        }
        this.selectedProviderId = id;
        this.selectedParentId = null;
        this.selectedChannelId = null;
        this.resources = null;
        this.connectError = null;
        this.channels = null;
        this.channelsError = null;
        this.messages = null;
        this.messagesError = null;
        this.renderView();
      });
    });
  }

  // ---- Settings (gear icon on the grid) ----

  private renderSettings(): void {
    this.clearAutoRefresh();
    this.innerHTML = `
      <div class="dash-subnav">
        <button id="comms-settings-back-btn" class="dash-back-btn" type="button">← Communication</button>
        <h2 class="workspace-stage-title">⚙️ Settings</h2>
      </div>
      <div class="connect-form">
        <label class="field">
          <input id="comms-setting-auto-read" type="checkbox" ${this.settings.autoRead ? "checked" : ""} />
          <span class="field-label">Slack: automatically mark a channel read when you open it</span>
        </label>
        <p class="connect-hint">Calls Slack's real conversations.mark - moves the bot's own read cursor for the channel, not a human user's (this app connects as a bot, which has no way to mark read-state on a person's behalf). Has no effect for Discord/Teams - neither has any real read-state a bot/app token can see or set.</p>

        <label class="field">
          <input id="comms-setting-hide-archived" type="checkbox" ${this.settings.hideArchived ? "checked" : ""} />
          <span class="field-label">Slack &amp; Teams: hide archived channels</span>
        </label>
        <p class="connect-hint">Filters out channels Slack's/Teams' own API reports as archived. Has no effect for Discord - it has no real archived concept for a bot token.</p>

        <label class="field">
          <span class="field-label">Auto-refresh</span>
          <select id="comms-setting-refresh-interval">
            ${AUTO_REFRESH_OPTIONS.map((o) => `<option value="${o.seconds}" ${o.seconds === this.settings.refreshIntervalSeconds ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
          </select>
        </label>
        <p class="connect-hint">Periodically re-fetches whichever list is on screen (channels or messages) - stops as soon as you leave that screen.</p>

        <label class="field">
          <span class="field-label">Default provider on open</span>
          <select id="comms-setting-default-provider">
            <option value="" ${this.settings.defaultProviderId === "" ? "selected" : ""}>None - always show the provider grid</option>
            ${COMMS_PROVIDER_CATALOG.map((p) => `<option value="${p.id}" ${p.id === this.settings.defaultProviderId ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
        </label>
      </div>
    `;

    this.querySelector("#comms-settings-back-btn")?.addEventListener("click", () => {
      this.showSettings = false;
      this.renderView();
    });

    const persist = (partial: Partial<CommsSettings>) => {
      this.settings = { ...this.settings, ...partial };
      setStoredCommsSettings(this.settings);
    };
    this.querySelector<HTMLInputElement>("#comms-setting-auto-read")?.addEventListener("change", (e) => {
      persist({ autoRead: (e.target as HTMLInputElement).checked });
    });
    this.querySelector<HTMLInputElement>("#comms-setting-hide-archived")?.addEventListener("change", (e) => {
      persist({ hideArchived: (e.target as HTMLInputElement).checked });
    });
    this.querySelector<HTMLSelectElement>("#comms-setting-refresh-interval")?.addEventListener("change", (e) => {
      persist({ refreshIntervalSeconds: Number((e.target as HTMLSelectElement).value) });
    });
    this.querySelector<HTMLSelectElement>("#comms-setting-default-provider")?.addEventListener("change", (e) => {
      persist({ defaultProviderId: (e.target as HTMLSelectElement).value });
    });
  }

  // ---- Level 1: provider connect screen (real channels for Slack,
  // real guilds/teams for Discord/Teams) ----

  private renderDetail(provider: CommsProvider): void {
    const connected = this.isProviderConnected(provider);
    const tokenHint = provider.tokenHint
      ? `<p class="connect-hint">Get a real token: <code>${escapeHtml(provider.tokenHint.command)}</code> - expires in ${escapeHtml(provider.tokenHint.expiry)}, re-run and reconnect once it does.</p>`
      : "";

    this.innerHTML = `
      <div class="dash-subnav">
        <button id="comms-back-btn" class="dash-back-btn" type="button">← Communication</button>
        <h2 class="workspace-stage-title">${renderProviderBadge(provider)} ${escapeHtml(provider.name)}</h2>
      </div>
      <p class="settings-disclosure">Stored only on this device. Sent directly to ${escapeHtml(provider.name)} when you connect.</p>
      ${tokenHint}
      <div class="connect-form">
        <input id="comms-connect-token" type="password" placeholder="Paste your ${escapeHtml(provider.name)} token" autocomplete="off" spellcheck="false" />
        <div class="connect-actions">
          <button id="comms-connect-btn" type="button">${connected ? "Reconnect" : "Connect"}</button>
          ${connected ? `<button id="comms-disconnect-btn" type="button" class="btn-secondary">Disconnect</button>` : ""}
        </div>
        <p id="comms-connect-status" class="connect-status${this.connectError ? " connect-status-error" : ""}">${this.connecting ? "Connecting…" : this.connectError ? `⚠️ ${escapeHtml(this.connectError)}` : ""}</p>
      </div>
      ${this.renderResourceList(provider)}
    `;

    this.querySelector("#comms-back-btn")?.addEventListener("click", () => {
      this.selectedProviderId = null;
      this.renderView();
    });
    this.querySelector("#comms-connect-btn")?.addEventListener("click", () => {
      void this.handleConnect(provider);
    });
    this.querySelector("#comms-disconnect-btn")?.addEventListener("click", () => {
      setStoredCommsToken(provider.id, "");
      this.resources = null;
      this.connectError = null;
      this.renderView();
    });
    this.querySelectorAll<HTMLButtonElement>("[data-resource-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.resourceId;
        if (!id) {
          return;
        }
        if (provider.kind === "channels") {
          this.selectedChannelId = id;
        } else {
          this.selectedParentId = id;
        }
        this.renderView();
      });
    });

    // Already connected (a token was saved in a previous session) and
    // nothing fetched yet this visit - fetch automatically, same
    // lazy-validation posture as workspace.ts's Cloud/Repository screens.
    if (connected && !this.resources && !this.connectError && !this.connecting) {
      void this.handleConnect(provider);
    } else if (this.resources) {
      this.scheduleAutoRefresh(() => void this.handleConnect(provider));
    }
  }

  private applyArchivedFilter(list: readonly CommsResource[]): readonly CommsResource[] {
    return this.settings.hideArchived ? list.filter((r) => !r.archived) : list;
  }

  private renderResourceList(provider: CommsProvider): string {
    if (!this.resources) {
      return "";
    }
    const visible = this.applyArchivedFilter(this.resources);
    const label = provider.kind === "channels" ? "Channels" : "Teams / Servers";
    const rows =
      visible.length === 0
        ? `<p class="connect-hint">Connected - no results found${this.settings.hideArchived ? " (archived channels are hidden - see Settings)" : ""}.</p>`
        : `<ul class="resource-list">
            ${visible
              .map(
                (r) => `
                  <li class="resource-row">
                    <button type="button" class="resource-open-btn" data-resource-id="${r.id}">
                      <span class="resource-name">${escapeHtml(r.name)}</span>
                      <span class="resource-status">${escapeHtml(r.status)}</span>
                    </button>
                  </li>
                `,
              )
              .join("")}
          </ul>`;
    return `<h3 class="resource-list-label">${label}</h3>${rows}`;
  }

  private async handleConnect(provider: CommsProvider): Promise<void> {
    const statusEl = this.querySelector<HTMLElement>("#comms-connect-status");
    const connectBtn = this.querySelector<HTMLButtonElement>("#comms-connect-btn");
    const tokenInput = this.querySelector<HTMLInputElement>("#comms-connect-token");
    const token = tokenInput?.value.trim() || getStoredCommsToken(provider.id);
    if (!token) {
      this.connectError = "Paste a token first.";
      this.renderView();
      return;
    }

    this.connecting = true;
    this.connectError = null;
    if (connectBtn) {
      connectBtn.disabled = true;
    }
    if (statusEl) {
      statusEl.textContent = "Connecting…";
    }
    try {
      const resources = await COMMS_CONNECTORS[provider.id]!(token);
      setStoredCommsToken(provider.id, token);
      this.resources = resources;
      this.connectError = null;
    } catch (e) {
      this.connectError = e instanceof Error ? e.message : String(e);
      this.resources = null;
    } finally {
      this.connecting = false;
      this.renderView();
    }
  }

  // ---- Level 2 (Discord/Teams only): real channel list within the
  // selected guild/team ----

  private renderChannelList(provider: CommsProvider): void {
    this.innerHTML = `
      <div class="dash-subnav">
        <button id="comms-channels-back-btn" class="dash-back-btn" type="button">← ${escapeHtml(provider.name)}</button>
        <h2 class="workspace-stage-title">${renderProviderBadge(provider)} Channels</h2>
      </div>
      <p id="comms-channels-status" class="connect-status${this.channelsError ? " connect-status-error" : ""}">${this.channelsLoading ? "Loading…" : this.channelsError ? `⚠️ ${escapeHtml(this.channelsError)}` : ""}</p>
      ${this.renderChannelRows()}
    `;

    this.querySelector("#comms-channels-back-btn")?.addEventListener("click", () => {
      this.selectedParentId = null;
      this.channels = null;
      this.channelsError = null;
      this.renderView();
    });
    this.querySelectorAll<HTMLButtonElement>("[data-channel-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.channelId;
        if (id) {
          this.selectedChannelId = id;
          this.renderView();
        }
      });
    });

    if (!this.channels && !this.channelsError && !this.channelsLoading) {
      void this.handleListChannels(provider);
    } else if (this.channels) {
      this.scheduleAutoRefresh(() => void this.handleListChannels(provider));
    }
  }

  private renderChannelRows(): string {
    if (!this.channels) {
      return "";
    }
    const visible = this.applyArchivedFilter(this.channels);
    if (visible.length === 0) {
      return `<p class="connect-hint">No channels found${this.settings.hideArchived ? " (archived channels are hidden - see Settings)" : ""}.</p>`;
    }
    return `<ul class="resource-list">
      ${visible
        .map(
          (c) => `
            <li class="resource-row">
              <button type="button" class="resource-open-btn" data-channel-id="${c.id}">
                <span class="resource-name">${escapeHtml(c.name)}</span>
                <span class="resource-status">${escapeHtml(c.status)}</span>
              </button>
            </li>
          `,
        )
        .join("")}
    </ul>`;
  }

  private async handleListChannels(provider: CommsProvider): Promise<void> {
    if (!this.selectedParentId) {
      return;
    }
    const token = getStoredCommsToken(provider.id);
    this.channelsLoading = true;
    this.channelsError = null;
    this.renderView();
    try {
      this.channels = await COMMS_CHANNEL_LISTERS[provider.id]!(token, this.selectedParentId);
      this.channelsError = null;
    } catch (e) {
      this.channelsError = e instanceof Error ? e.message : String(e);
      this.channels = null;
    } finally {
      this.channelsLoading = false;
      this.renderView();
    }
  }

  // ---- Level 3 (all providers): real per-channel message thread ----

  private renderMessageThread(provider: CommsProvider): void {
    const backTarget = provider.kind === "guildsOrTeams" ? "Channels" : provider.name;
    this.innerHTML = `
      <div class="dash-subnav">
        <button id="comms-messages-back-btn" class="dash-back-btn" type="button">← ${escapeHtml(backTarget)}</button>
        <h2 class="workspace-stage-title">${renderProviderBadge(provider)} Messages</h2>
      </div>
      <p id="comms-messages-status" class="connect-status${this.messagesError ? " connect-status-error" : ""}">${this.messagesLoading ? "Loading…" : this.messagesError ? `⚠️ ${escapeHtml(this.messagesError)}` : ""}</p>
      ${this.renderMessageRows()}
    `;

    this.querySelector("#comms-messages-back-btn")?.addEventListener("click", () => {
      this.selectedChannelId = null;
      this.messages = null;
      this.messagesError = null;
      this.renderView();
    });

    if (!this.messages && !this.messagesError && !this.messagesLoading) {
      void this.handleListMessages(provider);
    } else if (this.messages) {
      this.scheduleAutoRefresh(() => void this.handleListMessages(provider));
    }
  }

  private renderMessageRows(): string {
    if (!this.messages) {
      return "";
    }
    if (this.messages.length === 0) {
      return `<p class="connect-hint">No messages found.</p>`;
    }
    return `<ul class="resource-list">
      ${this.messages
        .map(
          (m) => `
            <li class="resource-row">
              <span class="resource-name">${escapeHtml(m.author)}: ${escapeHtml(m.text)}</span>
              <span class="resource-status">${escapeHtml(m.timestamp)}</span>
            </li>
          `,
        )
        .join("")}
    </ul>`;
  }

  private async handleListMessages(provider: CommsProvider): Promise<void> {
    if (!this.selectedChannelId) {
      return;
    }
    const token = getStoredCommsToken(provider.id);
    this.messagesLoading = true;
    this.messagesError = null;
    this.renderView();
    try {
      const messages = await COMMS_MESSAGE_LISTERS[provider.id]!(token, this.selectedChannelId, this.selectedParentId ?? "");
      this.messages = messages;
      this.messagesError = null;
      // Real, Slack-only auto-read (see Settings) - marks the bot's own
      // read cursor up to the newest message (Slack's conversations.history
      // returns newest-first by default, matching Discord's own
      // confirmed convention).
      if (provider.id === "slack" && this.settings.autoRead && messages.length > 0) {
        try {
          await markSlackRead(token, this.selectedChannelId, messages[0]!.timestamp);
        } catch {
          // Real, best-effort only - a failed auto-read call shouldn't
          // block or error out an otherwise-successful message fetch.
        }
      }
    } catch (e) {
      this.messagesError = e instanceof Error ? e.message : String(e);
      this.messages = null;
    } finally {
      this.messagesLoading = false;
      this.renderView();
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-communication")) {
  customElements.define("x-communication", CommunicationElement);
}
