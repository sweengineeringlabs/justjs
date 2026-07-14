// Real, official brand marks (CC0, offline - no runtime network call,
// same posture as workspace.ts/communication.ts) via simple-icons for
// Mastodon/Bluesky/Reddit/X - all 4 are in simple-icons' catalog for
// real. LinkedIn is NOT (confirmed - same real gap AWS/Azure/Heroku hit
// in workspace.ts's CLOUD_PROVIDER_CATALOG), so it falls back to a
// plain colored monogram instead of a fabricated logo shape.
import mastodonLogo from "simple-icons/icons/mastodon.svg?raw";
import blueskyLogo from "simple-icons/icons/bluesky.svg?raw";
import redditLogo from "simple-icons/icons/reddit.svg?raw";
import xLogo from "simple-icons/icons/x.svg?raw";
import {
  getStoredSocialToken,
  setStoredSocialToken,
  getStoredBlueskyCredentials,
  setStoredBlueskyCredentials,
  getStoredRedditCredentials,
  setStoredRedditCredentials,
} from "../core/socials_credentials.js";
import { connectMastodon, connectBluesky, connectReddit } from "../core/socials_connect.js";
import type { SocialResource } from "../core/socials_connect.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

interface SocialProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly logo?: string;
  // "bearer" - Mastodon's single pasted token, sent as `Authorization:
  // Bearer`, same posture as ai_assist.ts's Anthropic key. "apppassword" -
  // Bluesky's real 2-field identifier + App Password (AT Protocol's own
  // real convention, never the account password) - see
  // core/bluesky_provider.ts for why nothing but these 2 fields is ever
  // persisted. "clientcreds" - Reddit's real 2-field client ID + secret,
  // exchanged for an app-level-only token (see the disclosure text in
  // renderSocialProviderBody below) - real user-scoped access needs the
  // full OAuth consent flow, out of scope here. "unsupported" - X/
  // Twitter's and LinkedIn's APIs did not return CORS headers when
  // checked live; connecting directly from a browser isn't confirmed
  // possible, so both stay an honest "not available" state rather than a
  // connect form that might silently fail, same treatment Cloudflare
  // already gets in workspace.ts's CLOUD_PROVIDER_CATALOG.
  readonly kind: "bearer" | "apppassword" | "clientcreds" | "unsupported";
}

// A real, recognizable set of actual social providers - not a free-text
// "type any name" list. 3 of 5 are real, connectable providers with 3
// genuinely different auth shapes; X/Twitter and LinkedIn are shown
// honestly as not available rather than silently omitted.
const SOCIAL_PROVIDER_CATALOG: readonly SocialProvider[] = [
  { id: "mastodon", name: "Mastodon", icon: "🐘", color: "#6364FF", logo: mastodonLogo, kind: "bearer" },
  { id: "bluesky", name: "Bluesky", icon: "🦋", color: "#1185FE", logo: blueskyLogo, kind: "apppassword" },
  { id: "reddit", name: "Reddit", icon: "👽", color: "#FF4500", logo: redditLogo, kind: "clientcreds" },
  { id: "x", name: "X (Twitter)", icon: "✕", color: "#000000", logo: xLogo, kind: "unsupported" },
  { id: "linkedin", name: "LinkedIn", icon: "💼", color: "#0A66C2", kind: "unsupported" },
];

// simple-icons ships each SVG with no `fill` set, meant for the
// consumer to recolor. Same treatment workspace.ts's/communication.ts's
// own provider badges already use - fill="currentColor" injected here,
// `color: white` set on the wrapping badge in CSS (the already-generic
// .provider-icon rule, reused as-is - no new CSS needed).
function renderProviderBadge(p: { readonly icon?: string; readonly color: string; readonly logo?: string }): string {
  const glyph = p.logo ? p.logo.replace("<svg ", '<svg fill="currentColor" ') : escapeHtml(p.icon ?? "");
  return `<span class="provider-icon" style="background: ${p.color}">${glyph}</span>`;
}

// Socials - the 7th top-level tab. Same simpler-than-Workspace shape
// communication.ts already established: no SDLC-stage wrapper, this IS
// directly the 5-provider grid (3 real connect screens plus 2 honest
// not-available states), reusing the same generic
// .provider-*/.connect-*/.resource-* CSS classes.
export class SocialsElement extends HTMLElement {
  private selectedProviderId: string | null = null;
  private resources: SocialResource[] | null = null;
  private connectError: string | null = null;
  private connecting = false;

  connectedCallback(): void {
    this.renderView();
  }

  private renderView(): void {
    if (this.selectedProviderId) {
      const provider = SOCIAL_PROVIDER_CATALOG.find((p) => p.id === this.selectedProviderId);
      if (provider) {
        this.renderDetail(provider);
        return;
      }
      this.selectedProviderId = null;
    }
    this.renderGrid();
  }

  private isProviderConnected(p: SocialProvider): boolean {
    if (p.kind === "apppassword") {
      return getStoredBlueskyCredentials() !== null;
    }
    if (p.kind === "clientcreds") {
      return getStoredRedditCredentials() !== null;
    }
    if (p.kind === "unsupported") {
      return false;
    }
    return getStoredSocialToken(p.id).length > 0;
  }

  private renderGrid(): void {
    this.innerHTML = `
      <div class="dash-subnav">
        <h2 class="workspace-stage-title">🌐 Socials</h2>
      </div>
      <p class="connect-hint">Tap a provider to connect a real account and see its actual data. Credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
      <div class="provider-grid">
        ${SOCIAL_PROVIDER_CATALOG.map((p) => {
          const connected = this.isProviderConnected(p);
          return `
            <button type="button" class="provider-card${connected ? " selected" : ""}" data-social-provider-id="${p.id}">
              ${renderProviderBadge(p)}
              <span class="provider-name">${escapeHtml(p.name)}</span>
              <span class="provider-check">${connected ? "✓ Connected" : ""}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;

    this.querySelectorAll<HTMLButtonElement>("[data-social-provider-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.socialProviderId;
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

  private renderDetail(provider: SocialProvider): void {
    const connected = this.isProviderConnected(provider);
    this.innerHTML = `
      <div class="dash-subnav">
        <button id="socials-back-btn" class="dash-back-btn" type="button">← Socials</button>
        <h2 class="workspace-stage-title">${renderProviderBadge(provider)} ${escapeHtml(provider.name)}</h2>
      </div>
      ${this.renderProviderBody(provider, connected)}
    `;

    this.querySelector("#socials-back-btn")?.addEventListener("click", () => {
      this.selectedProviderId = null;
      this.renderView();
    });

    if (provider.kind === "unsupported") {
      return;
    }

    this.querySelector("#socials-connect-btn")?.addEventListener("click", () => {
      void this.handleConnect(provider);
    });
    this.querySelector("#socials-disconnect-btn")?.addEventListener("click", () => {
      if (provider.kind === "apppassword") {
        setStoredBlueskyCredentials(null);
      } else if (provider.kind === "clientcreds") {
        setStoredRedditCredentials(null);
      } else {
        setStoredSocialToken(provider.id, "");
      }
      this.resources = null;
      this.connectError = null;
      this.renderView();
    });

    // Already connected (a credential was saved in a previous session)
    // and nothing fetched yet this visit - fetch automatically, same
    // lazy-validation posture as workspace.ts's/communication.ts's own
    // connect screens.
    if (connected && !this.resources && !this.connectError && !this.connecting) {
      void this.handleConnect(provider);
    }
  }

  private renderProviderBody(provider: SocialProvider, connected: boolean): string {
    if (provider.kind === "unsupported") {
      return `
        <p class="connect-hint">⚠️ ${escapeHtml(provider.name)}'s API did not return CORS headers when checked directly from a browser - connecting here isn't confirmed possible without a backend proxy, which this app doesn't have. Left as a local-list-only entry rather than a connect form that might silently fail.</p>
      `;
    }

    const disclosure =
      provider.kind === "apppassword"
        ? `Stored only on this device. Sent directly to Bluesky when you connect. Use a real Bluesky "App Password" (Settings → App Passwords on bsky.app) - never your actual account password. Bluesky's own session token is short-lived, so this reconnects fresh every time rather than trying to cache it.`
        : provider.kind === "clientcreds"
          ? `Stored only on this device. Sent directly to Reddit when you connect. Reddit's client_credentials grant is app-level only - it proves your credentials work against real public data (r/popular), it cannot list your own saved posts or subscriptions. Full personal access needs Reddit's OAuth consent flow, not attempted here.`
          : `Stored only on this device. Sent directly to ${escapeHtml(provider.name)} when you connect.`;

    const form =
      provider.kind === "apppassword"
        ? `
          <input id="socials-connect-identifier" type="text" placeholder="Bluesky handle or email" autocomplete="off" spellcheck="false" />
          <input id="socials-connect-app-password" type="password" placeholder="App Password" autocomplete="off" spellcheck="false" />
        `
        : provider.kind === "clientcreds"
          ? `
          <input id="socials-connect-client-id" type="text" placeholder="Reddit client ID" autocomplete="off" spellcheck="false" />
          <input id="socials-connect-client-secret" type="password" placeholder="Reddit client secret" autocomplete="off" spellcheck="false" />
        `
          : `<input id="socials-connect-token" type="password" placeholder="Paste your ${escapeHtml(provider.name)} token" autocomplete="off" spellcheck="false" />`;

    return `
      <p class="settings-disclosure">${disclosure}</p>
      <div class="connect-form">
        ${form}
        <div class="connect-actions">
          <button id="socials-connect-btn" type="button">${connected ? "Reconnect" : "Connect"}</button>
          ${connected ? `<button id="socials-disconnect-btn" type="button" class="btn-secondary">Disconnect</button>` : ""}
        </div>
        <p id="socials-connect-status" class="connect-status${this.connectError ? " connect-status-error" : ""}">${this.connecting ? "Connecting…" : this.connectError ? `⚠️ ${escapeHtml(this.connectError)}` : ""}</p>
      </div>
      ${this.renderResourceList(provider)}
    `;
  }

  private renderResourceList(provider: SocialProvider): string {
    if (!this.resources) {
      return "";
    }
    const listLabel = provider.id === "bluesky" ? "Follows" : provider.id === "reddit" ? "r/popular" : "Lists";
    const rows =
      this.resources.length === 0
        ? `<p class="connect-hint">Connected - no results found.</p>`
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
    return `<h3 class="resource-list-label">${listLabel}</h3>${rows}`;
  }

  private async handleConnect(provider: SocialProvider): Promise<void> {
    const statusEl = this.querySelector<HTMLElement>("#socials-connect-status");
    const connectBtn = this.querySelector<HTMLButtonElement>("#socials-connect-btn");

    let blueskyCreds: { identifier: string; appPassword: string } | null = null;
    let redditCreds: { clientId: string; clientSecret: string } | null = null;
    let token = "";

    if (provider.kind === "apppassword") {
      const identifierInput = this.querySelector<HTMLInputElement>("#socials-connect-identifier");
      const appPasswordInput = this.querySelector<HTMLInputElement>("#socials-connect-app-password");
      const identifier = identifierInput?.value.trim() || getStoredBlueskyCredentials()?.identifier || "";
      const appPassword = appPasswordInput?.value.trim() || getStoredBlueskyCredentials()?.appPassword || "";
      if (!identifier || !appPassword) {
        this.connectError = "Enter both your handle/email and App Password.";
        this.renderView();
        return;
      }
      blueskyCreds = { identifier, appPassword };
    } else if (provider.kind === "clientcreds") {
      const clientIdInput = this.querySelector<HTMLInputElement>("#socials-connect-client-id");
      const clientSecretInput = this.querySelector<HTMLInputElement>("#socials-connect-client-secret");
      const clientId = clientIdInput?.value.trim() || getStoredRedditCredentials()?.clientId || "";
      const clientSecret = clientSecretInput?.value.trim() || getStoredRedditCredentials()?.clientSecret || "";
      if (!clientId || !clientSecret) {
        this.connectError = "Enter both the client ID and client secret.";
        this.renderView();
        return;
      }
      redditCreds = { clientId, clientSecret };
    } else {
      const tokenInput = this.querySelector<HTMLInputElement>("#socials-connect-token");
      token = tokenInput?.value.trim() || getStoredSocialToken(provider.id);
      if (!token) {
        this.connectError = "Paste a token first.";
        this.renderView();
        return;
      }
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
      const resources =
        provider.kind === "apppassword" && blueskyCreds
          ? await connectBluesky(blueskyCreds.identifier, blueskyCreds.appPassword)
          : provider.kind === "clientcreds" && redditCreds
            ? await connectReddit(redditCreds.clientId, redditCreds.clientSecret)
            : await connectMastodon(token);
      if (provider.kind === "apppassword" && blueskyCreds) {
        setStoredBlueskyCredentials(blueskyCreds);
      } else if (provider.kind === "clientcreds" && redditCreds) {
        setStoredRedditCredentials(redditCreds);
      } else {
        setStoredSocialToken(provider.id, token);
      }
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

if (typeof customElements !== "undefined" && !customElements.get("x-socials")) {
  customElements.define("x-socials", SocialsElement);
}
