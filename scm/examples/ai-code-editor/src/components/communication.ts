// Discord is the only one of the 3 real, official brand marks
// (CC0, offline) available in simple-icons' catalog - Slack and
// Microsoft Teams aren't (same real gap AWS/Azure/Heroku hit in
// workspace.ts's CLOUD_PROVIDER_CATALOG - major, commercially
// protective brands not in simple-icons at all). Slack/Teams fall back
// to a plain colored monogram instead of a fabricated logo shape.
import discordLogo from "simple-icons/icons/discord.svg?raw";
import { getStoredCommsToken, setStoredCommsToken } from "../core/comms_credentials.js";
import { connectSlack, connectDiscord, connectTeams } from "../core/comms_connect.js";
import type { CommsResource } from "../core/comms_connect.js";

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
}

// A real, recognizable set of actual communication providers - not a
// free-text "type any name" list. All 3 use a single pasted bearer-
// shaped token (a real bot token or CLI-issued access token), same
// security posture as the Anthropic key.
const COMMS_PROVIDER_CATALOG: readonly CommsProvider[] = [
  { id: "slack", name: "Slack", icon: "💬", color: "#4A154B" },
  { id: "discord", name: "Discord", icon: "🎮", color: "#5865F2", logo: discordLogo },
  {
    id: "teams",
    name: "Microsoft Teams",
    icon: "👥",
    color: "#6264A7",
    tokenHint: { command: "az account get-access-token --resource-type ms-graph --query accessToken -o tsv", expiry: "~60-90 minutes" },
  },
];

const COMMS_CONNECTORS: Record<string, (token: string) => Promise<CommsResource[]>> = {
  slack: connectSlack,
  discord: connectDiscord,
  teams: connectTeams,
};

// simple-icons ships each SVG with no `fill` set, meant for the
// consumer to recolor. Same treatment workspace.ts's cloud/SCM provider
// badges already use - fill="currentColor" injected here, `color:
// white` set on the wrapping badge in CSS (the already-generic
// .provider-icon rule, reused as-is - no new CSS needed).
function renderProviderBadge(p: CommsProvider): string {
  const glyph = p.logo ? p.logo.replace("<svg ", '<svg fill="currentColor" ') : escapeHtml(p.icon);
  return `<span class="provider-icon" style="background: ${p.color}">${glyph}</span>`;
}

// Communication - the 6th top-level tab. Simpler than Workspace: no
// SDLC-stage wrapper, this IS directly the 3-provider grid (real
// connect screens for Slack/Discord/Microsoft Teams), reusing the same
// generic .provider-*/.connect-*/.resource-* CSS classes and real-
// connect-screen structure workspace.ts's Cloud/Repository sections
// already established.
export class CommunicationElement extends HTMLElement {
  private selectedProviderId: string | null = null;
  private resources: CommsResource[] | null = null;
  private connectError: string | null = null;
  private connecting = false;

  connectedCallback(): void {
    this.renderView();
  }

  private renderView(): void {
    if (this.selectedProviderId) {
      const provider = COMMS_PROVIDER_CATALOG.find((p) => p.id === this.selectedProviderId);
      if (provider) {
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
    this.innerHTML = `
      <div class="dash-subnav">
        <h2 class="workspace-stage-title">📣 Communication</h2>
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

    this.querySelectorAll<HTMLButtonElement>("[data-comms-provider-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.commsProviderId;
        if (!id) {
          return;
        }
        this.selectedProviderId = id;
        this.resources = null;
        this.connectError = null;
        this.renderView();
      });
    });
  }

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
      ${this.renderResourceList()}
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

    // Already connected (a token was saved in a previous session) and
    // nothing fetched yet this visit - fetch automatically, same
    // lazy-validation posture as workspace.ts's Cloud/Repository screens.
    if (connected && !this.resources && !this.connectError && !this.connecting) {
      void this.handleConnect(provider);
    }
  }

  private renderResourceList(): string {
    if (!this.resources) {
      return "";
    }
    const rows =
      this.resources.length === 0
        ? `<p class="connect-hint">Connected - no channels/teams found on this account.</p>`
        : `<ul class="resource-list">
            ${this.resources
              .map(
                (r) => `
                  <li class="resource-row">
                    <span class="resource-name">${escapeHtml(r.name)}</span>
                    <span class="resource-status">${escapeHtml(r.status)}</span>
                  </li>
                `,
              )
              .join("")}
          </ul>`;
    return `<h3 class="resource-list-label">Channels / Teams</h3>${rows}`;
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
}

if (typeof customElements !== "undefined" && !customElements.get("x-communication")) {
  customElements.define("x-communication", CommunicationElement);
}
