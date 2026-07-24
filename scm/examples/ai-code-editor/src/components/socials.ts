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
import { SOCIAL_PROVIDER_CATALOG, isSocialProviderConnected } from "../core/socials_catalog.js";
import type { SocialProvider } from "../core/socials_catalog.js";
import { fetchSocialsDashboard } from "../core/socials_dashboard.js";
import "@justjs/component-view";
import type { NavHeaderView } from "@justjs/component-view";
import "@justjs/provider-connect";
import type { ProviderConnectorControl, ProviderCatalogItem } from "@justjs/provider-connect";
import { SocialsBase } from "../features/socials/socials_component.gen.js";

const RESOURCE_LIST_LABELS: Record<string, string> = {
  bluesky: "Follows",
  reddit: "r/popular",
};

// <control-provider-connector> (@justjs/provider-connect) owns the
// grid/detail/connect/list orchestration from here on - this only maps
// each real provider to its property surface, computed once at mount.
function toCatalogItem(p: SocialProvider): ProviderCatalogItem {
  if (p.kind === "unsupported") {
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      fields: [],
      unsupportedMessage: `⚠️ ${p.name}'s API did not return CORS headers when checked directly from a browser - connecting here isn't confirmed possible without a backend proxy, which this app doesn't have. Left as a local-list-only entry rather than a connect form that might silently fail.`,
    };
  }
  const base = {
    id: p.id,
    name: p.name,
    icon: p.icon,
    color: p.color,
    connected: isSocialProviderConnected(p),
    resourceListLabel: RESOURCE_LIST_LABELS[p.id] ?? "Lists",
    ...(p.logo !== undefined ? { logo: p.logo } : {}),
  };
  if (p.kind === "apppassword") {
    return {
      ...base,
      fields: [
        { id: "identifier", type: "text", placeholder: "Bluesky handle or email" },
        { id: "appPassword", type: "password", placeholder: "App Password" },
      ],
      disclosure: `Stored only on this device. Sent directly to Bluesky when you connect. Use a real Bluesky "App Password" (Settings → App Passwords on bsky.app) - never your actual account password. Bluesky's own session token is short-lived, so this reconnects fresh every time rather than trying to cache it.`,
    };
  }
  if (p.kind === "clientcreds") {
    return {
      ...base,
      fields: [
        { id: "clientId", type: "text", placeholder: "Reddit client ID" },
        { id: "clientSecret", type: "password", placeholder: "Reddit client secret" },
      ],
      disclosure: `Stored only on this device. Sent directly to Reddit when you connect. Reddit's client_credentials grant is app-level only - it proves your credentials work against real public data (r/popular), it cannot list your own saved posts or subscriptions. Full personal access needs Reddit's OAuth consent flow, not attempted here.`,
    };
  }
  return {
    ...base,
    fields: [{ id: "token", type: "password", placeholder: `Paste your ${p.name} token` }],
    disclosure: `Stored only on this device. Sent directly to ${p.name} when you connect.`,
  };
}

// Real, actionable errors on empty fields (the same "Paste a token
// first."/"Enter both..." copy every prior round of this app already
// showed) stay here - <view-form> deliberately validates nothing
// beyond rendering, per ADR-0015's own scope.
async function handleConnect(providerId: string, values: Readonly<Record<string, string>>): Promise<SocialResource[]> {
  const provider = SOCIAL_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  if (provider.kind === "apppassword") {
    const identifier = (values["identifier"] ?? "").trim() || getStoredBlueskyCredentials()?.identifier || "";
    const appPassword = (values["appPassword"] ?? "").trim() || getStoredBlueskyCredentials()?.appPassword || "";
    if (!identifier || !appPassword) {
      throw new Error("Enter both your handle/email and App Password.");
    }
    const resources = await connectBluesky(identifier, appPassword);
    setStoredBlueskyCredentials({ identifier, appPassword });
    return resources;
  }
  if (provider.kind === "clientcreds") {
    const clientId = (values["clientId"] ?? "").trim() || getStoredRedditCredentials()?.clientId || "";
    const clientSecret = (values["clientSecret"] ?? "").trim() || getStoredRedditCredentials()?.clientSecret || "";
    if (!clientId || !clientSecret) {
      throw new Error("Enter both the client ID and client secret.");
    }
    const resources = await connectReddit(clientId, clientSecret);
    setStoredRedditCredentials({ clientId, clientSecret });
    return resources;
  }
  const token = (values["token"] ?? "").trim() || getStoredSocialToken(providerId);
  if (!token) {
    throw new Error("Paste a token first.");
  }
  const resources = await connectMastodon(token);
  setStoredSocialToken(providerId, token);
  return resources;
}

function handleDisconnect(providerId: string): void {
  const provider = SOCIAL_PROVIDER_CATALOG.find((p) => p.id === providerId);
  if (!provider) {
    return;
  }
  if (provider.kind === "apppassword") {
    setStoredBlueskyCredentials(null);
  } else if (provider.kind === "clientcreds") {
    setStoredRedditCredentials(null);
  } else {
    setStoredSocialToken(providerId, "");
  }
}

// Socials - the 7th top-level tab. Mounts once and never re-renders
// itself again - <control-provider-connector> owns every subsequent
// grid<->detail transition, connect/disconnect call, and resource-list
// render internally from here on.
//
// Extends SocialsBase (justweb-generated, justjs#114 - the pilot for
// justjs#113's epic) for real value now that justweb#73/#74 shipped:
// data.builtinStates: false drops the 7 dead interactive-widget signals
// and the @preact/signals-core import this app never needed; declaring
// dom.elements gives real _bindElements()/_hasAllElements() (real
// data-ddas-id stamping too) instead of hand-rolled querySelector calls.
// SocialsBase itself self-registers as "js-socials" (its harmless,
// never-rendered default tag - deliberately not overridden to
// "x-socials" in socials_component.yaml, see that file's own comment:
// importing SocialsBase always runs its self-registration as a real ES
// module side effect, so if it claimed "x-socials" too, it would win
// that race and permanently lock out this real subclass, since
// customElements has no redefine/unregister).
export class SocialsElement extends SocialsBase {
  private mainView!: HTMLElement;
  private dashboardBtn!: HTMLButtonElement;
  private dashboardView!: HTMLElement;
  private dashboardBackBtn!: HTMLButtonElement;
  private dashboardList!: HTMLElement;

  connectedCallback(): void {
    this.innerHTML = `
      <div id="socials-main-view">
        <view-nav-header data-part="page-header"></view-nav-header>
        <div class="dash-subnav">
          <button id="socials-dashboard-btn" class="btn-secondary" type="button">📊 Dashboard</button>
        </div>
        <p class="connect-hint">Tap a provider to connect a real account and see its actual data. Credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
        <control-provider-connector data-part="connector"></control-provider-connector>
      </div>
      <div id="socials-dashboard-view" hidden>
        <div class="dash-subnav">
          <button id="socials-dashboard-back-btn" class="dash-back-btn" type="button">← Socials</button>
          <h2 class="workspace-stage-title">📊 Dashboard</h2>
        </div>
        <p class="connect-hint">Real data from every connected Socials provider, merged into one place - not a replacement for the provider grid, just another way to see what's already there.</p>
        <div id="socials-dashboard-list"></div>
      </div>
    `;
    // Binds this.pageHeader/this.connector via real data-part lookups -
    // must run after the markup above exists, since SocialsBase's own
    // connectedCallback() calls _bindElements() synchronously.
    super.connectedCallback();

    const header = this.pageHeader as NavHeaderView;
    header.icon = "🌐";
    header.title = "Socials";

    const connector = this.connector as ProviderConnectorControl;
    connector.catalogLabel = "Socials";
    connector.providers = SOCIAL_PROVIDER_CATALOG.map(toCatalogItem);
    connector.connect = handleConnect;
    connector.list = async (_providerId, session) => session as SocialResource[];
    connector.disconnect = handleDisconnect;

    this.mainView = this.querySelector<HTMLElement>("#socials-main-view")!;
    this.dashboardBtn = this.querySelector<HTMLButtonElement>("#socials-dashboard-btn")!;
    this.dashboardView = this.querySelector<HTMLElement>("#socials-dashboard-view")!;
    this.dashboardBackBtn = this.querySelector<HTMLButtonElement>("#socials-dashboard-back-btn")!;
    this.dashboardList = this.querySelector<HTMLElement>("#socials-dashboard-list")!;
    this.dashboardBtn.addEventListener("click", () => this.showDashboard());
    this.dashboardBackBtn.addEventListener("click", () => this.showMain());
  }

  private showMain(): void {
    this.dashboardView.hidden = true;
    this.mainView.hidden = false;
  }

  // Rebuilt fresh every time Dashboard is opened - real data, not a
  // stale cache, same "no reload needed after disconnecting a provider"
  // guarantee Connect → Agent's own config screen already established.
  private showDashboard(): void {
    this.mainView.hidden = true;
    this.dashboardView.hidden = false;
    this.dashboardList.innerHTML = `<p class="connect-hint">Loading…</p>`;
    void fetchSocialsDashboard().then((result) => this.renderDashboard(result));
  }

  private renderDashboard(result: Awaited<ReturnType<typeof fetchSocialsDashboard>>): void {
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
    const errorsHtml = result.errors
      .map((e) => `<p class="agent-step agent-step-error">⚠️ ${e.providerName}: ${e.message}</p>`)
      .join("");
    this.dashboardList.innerHTML = groupsHtml + errorsHtml;
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-socials")) {
  customElements.define("x-socials", SocialsElement);
}
