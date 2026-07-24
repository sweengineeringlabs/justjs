import {
  getStoredSocialToken,
  setStoredSocialToken,
  getStoredBlueskyCredentials,
  setStoredBlueskyCredentials,
  getStoredRedditCredentials,
  setStoredRedditCredentials,
} from "../core/socials_credentials.js";
import { connectMastodon, connectBluesky, connectReddit, connectTestSocial } from "../core/socials_connect.js";
import type { SocialResource } from "../core/socials_connect.js";
import { SOCIAL_PROVIDER_CATALOG, isSocialProviderConnected } from "../core/socials_catalog.js";
import type { SocialProvider } from "../core/socials_catalog.js";
import { fetchConsolidatedDashboardAnalytics } from "../core/socials_analytics.js";
import type { ConsolidatedDashboardAnalytics } from "../core/socials_analytics.js";
import { isDashboardProviderEnabled, setEnabledDashboardProviderIds } from "../core/dashboard_settings.js";
import "@justjs/component-view";
import type { NavHeaderView, GridView } from "@justjs/component-view";
import "@justjs/provider-connect";
import type { ProviderConnectorControl, ProviderCatalogItem } from "@justjs/provider-connect";
import { SocialsBase } from "../features/socials/socials_component.gen.js";

const RESOURCE_LIST_LABELS: Record<string, string> = {
  bluesky: "Follows",
  reddit: "r/popular",
  testsocial: "Test Items",
};

// "bearer" now has 2 real providers (Mastodon, Test Social) with the
// same single-token shape but genuinely different connect() targets -
// this dispatch table replaces a prior hardcoded `connectMastodon(token)`
// call that would have silently sent Test Social's token to Mastodon's
// real API instead.
const BEARER_CONNECTORS: Record<string, (token: string) => Promise<SocialResource[]>> = {
  mastodon: connectMastodon,
  testsocial: connectTestSocial,
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
  if (p.id === "testsocial") {
    return {
      ...base,
      fields: [{ id: "token", type: "text", placeholder: "Any value, e.g. ok" }],
      disclosure: `Never contacts a real backend - any pasted value "connects" with canned test data. Include "fail" in the token (e.g. "fail") to simulate a real rejected/failed call, useful for seeing Dashboard's per-provider error handling live.`,
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
  const connector = BEARER_CONNECTORS[providerId];
  if (!connector) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  const resources = await connector(token);
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
function formatActivityTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

type DashboardTabId = "analytics" | "trending" | "settings";

// Dashboard's own 3 switchable tabs - Analytics/Trending/Settings, NOT
// one tab per connected provider. An earlier round of this made that
// exact mistake: per-provider tabs just repeat the screen's own
// provider grid one level down, instead of being a genuinely
// different, cross-provider aggregated view - direct, corrective user
// feedback ("Your dashboard is repeating what is on Social... Not a
// repeat"). Recent Activity is NOT one of these tabs - it's a
// permanent section pinned at the bottom of the workspace regardless
// of which tab is active (direct spec: "Recent activities on bottom
// of workspace") - a 2nd corrective round after an early version
// buried it behind its own tab, hiding it from Dashboard's landing
// view.
const DASHBOARD_TABS: readonly { readonly id: DashboardTabId; readonly label: string; readonly icon: string }[] = [
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "trending", label: "Trending", icon: "🔥" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

export class SocialsElement extends SocialsBase {
  private mainView!: HTMLElement;
  private dashboardTileGrid!: GridView;
  private dashboardView!: HTMLElement;
  private dashboardBackBtn!: HTMLButtonElement;
  private dashboardTabsEl!: HTMLElement;
  private dashboardTabContentEl!: HTMLElement;
  private dashboardActivityEl!: HTMLElement;
  private dashboardData: ConsolidatedDashboardAnalytics | null = null;
  private activeDashboardTab: DashboardTabId = "analytics";
  private readonly expandedMetricKeys = new Set<string>();

  connectedCallback(): void {
    this.innerHTML = `
      <div id="socials-main-view">
        <view-nav-header data-part="page-header" hidden></view-nav-header>
        <p class="connect-hint">Tap a provider to connect a real account and see its actual data. Credentials are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none).</p>
        <control-provider-connector data-part="connector"></control-provider-connector>
        <view-grid id="socials-dashboard-tile-grid"></view-grid>
      </div>
      <div id="socials-dashboard-view" hidden>
        <div class="dash-subnav">
          <button id="socials-dashboard-back-btn" class="dash-back-btn" type="button">← Socials</button>
          <h2 class="workspace-stage-title">📊 Dashboard</h2>
        </div>
        <div id="socials-dashboard-tabs" class="dashboard-tabs"></div>
        <div id="socials-dashboard-tab-content"></div>
        <p class="dashboard-section-title">🕒 Recent Activity</p>
        <div id="socials-dashboard-activity"></div>
      </div>
    `;
    // Binds this.pageHeader/this.connector via real data-part lookups -
    // must run after the markup above exists, since SocialsBase's own
    // connectedCallback() calls _bindElements() synchronously.
    super.connectedCallback();

    // Kept hidden, not removed - required by SocialsBase's own
    // _hasAllElements() contract (justweb codegen, socials_component.yaml)
    // and the generated browser/e2e tests assert `[data-part="page-header"]`
    // exists. The *visible* "🌐 Socials" title now lives inline with
    // Connect's own "← Connect" back button instead (connect.ts's
    // showSection()) - real feedback: this screen's title rendered on its
    // own row below the back button, not aligned with it.
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
    this.dashboardView = this.querySelector<HTMLElement>("#socials-dashboard-view")!;
    this.dashboardBackBtn = this.querySelector<HTMLButtonElement>("#socials-dashboard-back-btn")!;
    this.dashboardTabsEl = this.querySelector<HTMLElement>("#socials-dashboard-tabs")!;
    this.dashboardTabContentEl = this.querySelector<HTMLElement>("#socials-dashboard-tab-content")!;
    this.dashboardActivityEl = this.querySelector<HTMLElement>("#socials-dashboard-activity")!;

    // Real <view-grid> (@justjs/component-view) - the same tile component
    // Connect's own top-level Comms/Socials/Cartoon/Agent grid uses, not a
    // small subnav button - Dashboard reads as a widget alongside this
    // screen's own provider tiles, one layer down from Connect's overview
    // grid (direct user request, not a stylistic choice).
    this.dashboardTileGrid = this.querySelector<GridView>("#socials-dashboard-tile-grid")!;
    this.dashboardTileGrid.items = [{ id: "dashboard", label: "Dashboard", icon: "📊" }];
    this.dashboardTileGrid.addEventListener("item-select", () => this.showDashboard());
    this.dashboardBackBtn.addEventListener("click", () => this.showMain());

    // Real fix for Dashboard "sticking" across a navigate-away-and-back
    // cycle: this custom element is cached forever by connect.ts (never
    // destroyed/re-created), so connectedCallback() never re-fires to
    // reset state on its own - connect.ts dispatches this event whenever
    // Socials itself is hidden (switched to a different section, or back
    // to Connect's overview/Agent), and resetting to the main view here
    // is what makes returning to Socials always start fresh on the
    // provider grid instead of wherever Dashboard was left. Also resets
    // the connector's own grid-vs-detail state via its real resetView()
    // (justjs#138/#137) - a provider's detail view (e.g. Mastodon's own
    // connect form) has exactly the same "stuck open" problem Dashboard
    // had, for the same underlying reason (this element is never
    // destroyed/recreated either).
    this.addEventListener("connect-section-hidden", () => {
      this.showMain();
      (this.connector as ProviderConnectorControl).resetView();
    });
  }

  private showMain(): void {
    this.dashboardView.hidden = true;
    this.mainView.hidden = false;
    this.dispatchEvent(new CustomEvent("connect-section-back-toggle", { bubbles: true, detail: { hideOuterBack: false } }));
  }

  // Rebuilt fresh every time Dashboard is opened - real data, not a
  // stale cache, same "no reload needed after disconnecting a provider"
  // guarantee Connect → Agent's own config screen already established.
  private showDashboard(): void {
    this.mainView.hidden = true;
    this.dashboardView.hidden = false;
    // Dashboard is entirely app-owned (unlike the provider grid/detail,
    // which <control-provider-connector> owns) - safe to hide Connect's
    // outer "← Connect" while here, since "← Socials" alone already
    // gets back to the exact same place.
    this.dispatchEvent(new CustomEvent("connect-section-back-toggle", { bubbles: true, detail: { hideOuterBack: true } }));
    this.activeDashboardTab = "analytics";
    this.expandedMetricKeys.clear();
    this.renderDashboardTabs();
    void this.loadDashboardData();
  }

  private renderDashboardTabs(): void {
    this.dashboardTabsEl.innerHTML = DASHBOARD_TABS.map(
      (t) => `
        <button type="button" class="dashboard-tab ${t.id === this.activeDashboardTab ? "dashboard-tab-active" : ""}" data-tab="${t.id}">
          ${t.icon} ${t.label}
        </button>
      `
    ).join("");
    this.dashboardTabsEl.querySelectorAll<HTMLButtonElement>("button[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.dataset["tab"] as DashboardTabId;
        if (tabId === this.activeDashboardTab) {
          return;
        }
        this.activeDashboardTab = tabId;
        this.renderDashboardTabs();
        this.renderActiveDashboardTab();
      });
    });
  }

  // One real fetch per Dashboard visit, shared by the Analytics/
  // Trending tabs AND the permanent Recent Activity section (all derive
  // from the same consolidated snapshot - switching tabs is a pure
  // re-render, not a re-fetch). Settings changes trigger a fresh fetch
  // of their own, since the enabled-provider set just changed.
  private async loadDashboardData(): Promise<void> {
    this.dashboardTabContentEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    this.dashboardActivityEl.innerHTML = `<p class="connect-hint">Loading…</p>`;
    this.dashboardData = await fetchConsolidatedDashboardAnalytics();
    this.renderActiveDashboardTab();
    this.renderActivitySection(this.dashboardData);
  }

  private renderActiveDashboardTab(): void {
    if (this.activeDashboardTab === "settings") {
      this.renderSettingsTab();
      return;
    }
    if (!this.dashboardData) {
      return;
    }
    if (this.activeDashboardTab === "analytics") {
      this.renderAnalyticsTab(this.dashboardData);
    } else {
      this.renderTrendingTab(this.dashboardData);
    }
  }

  // Distinguishes "nothing connected at all" from "connected but
  // switched off in Settings" - both are real, but a user who disabled
  // a provider they know is connected shouldn't be told to go connect
  // it again.
  private noDataHint(): string {
    const anyConnected = SOCIAL_PROVIDER_CATALOG.some(isSocialProviderConnected);
    return anyConnected
      ? "Nothing enabled - turn a provider back on in the Settings tab."
      : "Nothing connected yet - connect a provider above to see its real data here.";
  }

  // Stats render as a real single horizontal row of compact chips, not
  // a full-width one-per-row list (real feedback: the list "wastes
  // space" - "1 row, x columns" instead). Only one chip's drill-down
  // shows at a time, in the shared panel below the row - showing every
  // chip's own items inline no longer fits once chips sit side by side.
  private renderAnalyticsTab(data: ConsolidatedDashboardAnalytics): void {
    if (data.metrics.length === 0 && data.unavailable.length === 0) {
      this.dashboardTabContentEl.innerHTML = `<p class="connect-hint">${this.noDataHint()}</p>`;
      return;
    }
    const rowHtml = data.metrics
      .map((metric) => {
        const key = `${metric.providerId}:${metric.label}`;
        const active = this.expandedMetricKeys.has(key);
        return `
          <button type="button" class="metric-chip ${active ? "metric-chip-active" : ""}" data-metric-key="${key}">
            <span class="metric-chip-count">${metric.count}</span>
            <span class="metric-chip-label">${metric.providerIcon} ${metric.label}</span>
            <span class="metric-chip-source">${metric.providerName}</span>
          </button>
        `;
      })
      .join("");
    const selected = data.metrics.find((m) => this.expandedMetricKeys.has(`${m.providerId}:${m.label}`));
    const itemsHtml = selected
      ? `<div class="metric-items">${selected.items.map((item) => `<p class="metric-item">${item.label}</p>`).join("")}</div>`
      : "";
    const unavailableHtml = data.unavailable.map((u) => `<p class="connect-hint">⚠️ ${u.message}</p>`).join("");
    this.dashboardTabContentEl.innerHTML = `<div class="metrics-row">${rowHtml}</div>${itemsHtml}${unavailableHtml}`;

    // Tapping a stat's own number shows its real items in the shared
    // panel below the row (justjs#137: "clicking on number, details
    // show on workspace") - deliberately inline rather than a new
    // sub-screen, so this doesn't add another stacked back-button
    // layer. Only one at a time, since chips now sit side by side.
    this.dashboardTabContentEl.querySelectorAll<HTMLButtonElement>("button[data-metric-key]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset["metricKey"]!;
        if (this.expandedMetricKeys.has(key)) {
          this.expandedMetricKeys.delete(key);
        } else {
          this.expandedMetricKeys.clear();
          this.expandedMetricKeys.add(key);
        }
        this.renderAnalyticsTab(data);
      });
    });
  }

  private renderTrendingTab(data: ConsolidatedDashboardAnalytics): void {
    if (data.trending.length === 0) {
      this.dashboardTabContentEl.innerHTML = `<p class="connect-hint">Nothing trending right now.</p>`;
      return;
    }
    this.dashboardTabContentEl.innerHTML = data.trending
      .map(
        (item) => `
          <div class="trending-item">
            <span>${item.providerIcon} ${item.title} <span class="metric-source">· ${item.providerName}</span></span>
            <span class="trending-item-score">${item.score}</span>
          </div>
        `
      )
      .join("");
  }

  // Permanent - rendered once per fetch, unaffected by which of the 3
  // switchable tabs is active (direct spec: "Recent activities on
  // bottom of workspace"). An earlier round of this made Recent
  // Activity its own 4th tab, which hid it from Dashboard's landing
  // view entirely - real corrective feedback ("Why did you remove the
  // numbers, recent activities on dash's landing view?").
  private renderActivitySection(data: ConsolidatedDashboardAnalytics): void {
    if (data.recentActivity.length === 0) {
      this.dashboardActivityEl.innerHTML = `<p class="connect-hint">No recent activity.</p>`;
      return;
    }
    this.dashboardActivityEl.innerHTML = data.recentActivity
      .map(
        (item) => `
          <div class="activity-item">
            <span>${item.providerIcon} ${item.summary} <span class="metric-source">· ${item.providerName}</span></span>
            <span class="activity-item-time">${formatActivityTime(item.timestamp)}</span>
          </div>
        `
      )
      .join("");
  }

  // Dashboard's own Settings tab (justjs#137's "based on what user
  // configured their dash on settings tab") - toggles which connected
  // providers contribute to Analytics/Trending/Recent Activity. Lists
  // only connected providers - nothing to toggle for one that isn't.
  private renderSettingsTab(): void {
    const connected = SOCIAL_PROVIDER_CATALOG.filter(isSocialProviderConnected);
    if (connected.length === 0) {
      this.dashboardTabContentEl.innerHTML = `<p class="connect-hint">Nothing connected yet - connect a provider above, then come back here to choose what Dashboard shows.</p>`;
      return;
    }
    this.dashboardTabContentEl.innerHTML = `
      <p class="connect-hint">Choose which connected providers contribute to Analytics, Trending, and Recent Activity.</p>
      ${connected
        .map(
          (p) => `
            <label class="field">
              <input type="checkbox" data-settings-provider="${p.id}" ${isDashboardProviderEnabled(p.id) ? "checked" : ""} />
              <span class="field-label">${p.icon} ${p.name}</span>
            </label>
          `
        )
        .join("")}
    `;
    this.dashboardTabContentEl.querySelectorAll<HTMLInputElement>("input[data-settings-provider]").forEach((input) => {
      input.addEventListener("change", () => {
        const enabledIds = connected
          .filter((p) => this.dashboardTabContentEl.querySelector<HTMLInputElement>(`input[data-settings-provider="${p.id}"]`)?.checked)
          .map((p) => p.id);
        setEnabledDashboardProviderIds(enabledIds);
        // Refetch so Analytics/Trending/Recent Activity reflect the
        // change the moment the user switches back to them - re-renders
        // this same Settings tab too (loadDashboardData() always ends
        // with renderActiveDashboardTab()), harmless since it just
        // redraws identical checkboxes.
        void this.loadDashboardData();
      });
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-socials")) {
  customElements.define("x-socials", SocialsElement);
}
