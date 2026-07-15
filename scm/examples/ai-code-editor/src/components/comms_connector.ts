import "@justjs/component-view";
import type {
  GridView,
  FormView,
  FormField,
  StatusLineView,
  ListView,
  ListItem,
  NavHeaderView,
  BadgeView,
} from "@justjs/component-view";

export interface CommsCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly logo?: string;
  readonly connected: boolean;
  readonly fields: readonly FormField[];
  readonly disclosure?: string;
  readonly tokenHint?: { readonly command: string; readonly expiry: string };
  // "Channels" (Slack - connect() already returns real channels
  // directly) or "Teams / Servers" (Discord/Teams - connect() returns
  // the top-level guild/team, one real level shallower).
  readonly resourceListLabel: string;
  // Discord/Teams only - connect()'s own resources are guilds/teams,
  // not channels, so selecting one opens a real, separate channel-list
  // fetch before ever reaching messages. Absent (false) for Slack,
  // whose connect() resources ARE channels - selecting one goes
  // straight to messages.
  readonly hasChannelList?: boolean;
}

export type ConnectFunction = (providerId: string, values: Readonly<Record<string, string>>) => Promise<unknown>;
export type ListFunction = (providerId: string, session: unknown) => Promise<readonly ListItem[]>;
export type DisconnectFunction = (providerId: string) => void;
export type ListChannelsFunction = (providerId: string, parentId: string) => Promise<readonly ListItem[]>;
// parentId is only real for Teams (its own listMessages needs the
// parent team id too, unlike Slack/Discord) - always passed, ignored
// by the other two's own real implementations.
export type ListMessagesFunction = (providerId: string, channelId: string, parentId: string) => Promise<readonly ListItem[]>;

// Real Custom Element for Communication's own connect + channel/message
// drill-down (justjs#120). Same "provider grid -> tap -> form -> Connect
// -> resource list" shape ProviderConnectorControl/CloudConnectorControl
// already cover, composing the same view-grid/view-form/
// view-status-line/view-list/view-nav-header/view-badge primitives - but
// with two more real navigational levels neither sibling control was
// ever built for: a resource-list row is itself clickable (real use of
// <view-list clickable>'s item-select, built in justjs#111 but never
// actually composed by a real consumer until now), leading to either a
// message thread directly (Slack: connect()'s own resources ARE
// channels) or a real second fetch - Discord's/Teams' own guild/team ->
// channel list -> messages, since their connect() only returns the
// top-level guild/team. A real sibling, not a forced reuse of either
// existing control - the drill-down shape genuinely doesn't fit either
// (ProviderConnectorControl has no click-to-go-deeper concept at all;
// CloudConnectorControl's two extra actions are flat, not recursive).
//
// Auto-refresh (re-invoking whichever fetch matches the current step,
// on a real interval) lives here, not in the host - it's tied to
// exactly which step is showing, information only this control has.
export class CommsConnectorControl extends HTMLElement {
  #providers: readonly CommsCatalogItem[] = [];
  #connect: ConnectFunction | undefined;
  #list: ListFunction | undefined;
  #disconnect: DisconnectFunction | undefined;
  #listChannels: ListChannelsFunction | undefined;
  #listMessages: ListMessagesFunction | undefined;
  #catalogLabel = "";
  #refreshIntervalSeconds = 0;
  #selectedProviderId: string | null = null;
  #selectedParentId: string | null = null;
  #selectedChannelId: string | null = null;
  #connecting = false;
  #error: string | null = null;
  #resources: readonly ListItem[] | null = null;
  #channelsLoading = false;
  #channelsError: string | null = null;
  #channels: readonly ListItem[] | null = null;
  #messagesLoading = false;
  #messagesError: string | null = null;
  #messages: readonly ListItem[] | null = null;
  readonly #connectedIds = new Set<string>();
  #refreshTimerId: ReturnType<typeof setInterval> | null = null;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get providers(): readonly CommsCatalogItem[] {
    return this.#providers;
  }
  set providers(value: readonly CommsCatalogItem[]) {
    this.#providers = value;
    for (const p of value) {
      if (p.connected) {
        this.#connectedIds.add(p.id);
      }
    }
    this.render();
  }

  set connect(fn: ConnectFunction | undefined) {
    this.#connect = fn;
  }
  set list(fn: ListFunction | undefined) {
    this.#list = fn;
  }
  set disconnect(fn: DisconnectFunction | undefined) {
    this.#disconnect = fn;
  }
  set listChannels(fn: ListChannelsFunction | undefined) {
    this.#listChannels = fn;
  }
  set listMessages(fn: ListMessagesFunction | undefined) {
    this.#listMessages = fn;
  }

  get catalogLabel(): string {
    return this.#catalogLabel;
  }
  set catalogLabel(value: string) {
    this.#catalogLabel = value;
    this.render();
  }

  // Re-set by the host whenever Settings' own auto-refresh interval
  // changes - re-arms the timer against whichever step is currently
  // showing real data.
  set refreshIntervalSeconds(value: number) {
    this.#refreshIntervalSeconds = value;
    if (this.#hasRealData()) {
      this.#scheduleAutoRefresh();
    }
  }

  connectedCallback(): void {
    this.render();
  }

  disconnectedCallback(): void {
    this.#clearAutoRefresh();
  }

  #findProvider(id: string | null): CommsCatalogItem | undefined {
    return this.#providers.find((p) => p.id === id);
  }

  #hasRealData(): boolean {
    return this.#messages !== null || this.#channels !== null || this.#resources !== null;
  }

  #clearAutoRefresh(): void {
    if (this.#refreshTimerId !== null) {
      clearInterval(this.#refreshTimerId);
      this.#refreshTimerId = null;
    }
  }

  #scheduleAutoRefresh(): void {
    this.#clearAutoRefresh();
    if (this.#refreshIntervalSeconds <= 0) {
      return;
    }
    this.#refreshTimerId = setInterval(() => this.#refetchCurrentStep(), this.#refreshIntervalSeconds * 1000);
  }

  #refetchCurrentStep(): void {
    const provider = this.#findProvider(this.#selectedProviderId);
    if (!provider) {
      return;
    }
    if (this.#selectedChannelId) {
      void this.#fetchMessages(provider);
      return;
    }
    if (provider.hasChannelList && this.#selectedParentId) {
      void this.#fetchChannels(provider);
      return;
    }
    void this.#handleSubmit(provider, {});
  }

  async #handleSubmit(provider: CommsCatalogItem, values: Readonly<Record<string, string>>): Promise<void> {
    this.#connecting = true;
    this.#error = null;
    this.render();
    try {
      const session = await this.#connect?.(provider.id, values);
      this.#connectedIds.add(provider.id);
      this.dispatchEvent(new CustomEvent("connected", { detail: { providerId: provider.id }, bubbles: true, composed: true }));
      this.#resources = (await this.#list?.(provider.id, session)) ?? [];
    } catch (e) {
      this.#error = e instanceof Error ? e.message : String(e);
      this.dispatchEvent(
        new CustomEvent("error", { detail: { providerId: provider.id, message: this.#error }, bubbles: true, composed: true })
      );
    } finally {
      this.#connecting = false;
      this.render();
    }
  }

  #handleDisconnect(provider: CommsCatalogItem): void {
    this.#disconnect?.(provider.id);
    this.#connectedIds.delete(provider.id);
    this.#resources = null;
    this.#error = null;
    this.#clearAutoRefresh();
    this.render();
  }

  #maybeAutoConnect(provider: CommsCatalogItem): void {
    if (this.#connectedIds.has(provider.id) && this.#resources === null && !this.#connecting && !this.#error) {
      void this.#handleSubmit(provider, {});
    }
  }

  // Real "default provider on open" (Settings) - jumps straight to a
  // provider's own detail screen, same as a real tap on its grid tile
  // (including the same lazy auto-connect if already connected).
  // `providers` must already be set before calling this, same
  // ordering requirement every other prop-setter composition in this
  // epic already has.
  openProvider(id: string): void {
    this.#selectedProviderId = id;
    const provider = this.#findProvider(id);
    this.render();
    if (provider) {
      this.#maybeAutoConnect(provider);
    }
  }

  async #fetchChannels(provider: CommsCatalogItem): Promise<void> {
    if (!this.#selectedParentId) {
      return;
    }
    this.#channelsLoading = true;
    this.#channelsError = null;
    this.render();
    try {
      this.#channels = (await this.#listChannels?.(provider.id, this.#selectedParentId)) ?? [];
    } catch (e) {
      this.#channelsError = e instanceof Error ? e.message : String(e);
      this.#channels = null;
    } finally {
      this.#channelsLoading = false;
      this.render();
    }
  }

  async #fetchMessages(provider: CommsCatalogItem): Promise<void> {
    if (!this.#selectedChannelId) {
      return;
    }
    this.#messagesLoading = true;
    this.#messagesError = null;
    this.render();
    try {
      this.#messages = (await this.#listMessages?.(provider.id, this.#selectedChannelId, this.#selectedParentId ?? "")) ?? [];
    } catch (e) {
      this.#messagesError = e instanceof Error ? e.message : String(e);
      this.#messages = null;
    } finally {
      this.#messagesLoading = false;
      this.render();
    }
  }

  private render(): void {
    this.#clearAutoRefresh();
    if (!this.#selectedProviderId) {
      this.#renderGrid();
      return;
    }
    const provider = this.#findProvider(this.#selectedProviderId);
    if (!provider) {
      this.#selectedProviderId = null;
      this.#renderGrid();
      return;
    }
    if (this.#selectedChannelId) {
      this.#renderMessages(provider);
      return;
    }
    if (provider.hasChannelList && this.#selectedParentId) {
      this.#renderChannels(provider);
      return;
    }
    this.#renderDetail(provider);
  }

  #renderGrid(): void {
    this.#root.innerHTML = `
      <style>:host { display: block; }</style>
      <view-grid></view-grid>
    `;
    const grid = this.#root.querySelector<GridView>("view-grid")!;
    grid.items = this.#providers.map((p) => {
      const connected = this.#connectedIds.has(p.id);
      return {
        id: p.id,
        label: p.name,
        icon: p.icon,
        badgeColor: p.color,
        ...(p.logo !== undefined ? { badgeLogo: p.logo } : {}),
        ...(connected ? { status: "✓ Connected" } : {}),
        selected: connected,
      };
    });
    grid.addEventListener("item-select", (e) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      this.#selectedProviderId = id;
      this.#error = null;
      this.#resources = null;
      this.render();
      const provider = this.#findProvider(id);
      if (provider) {
        this.#maybeAutoConnect(provider);
      }
    });
  }

  #sharedStyle(): string {
    return `
      <style>
        :host { display: block; }
        .settings-disclosure { margin: 0 0 10px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .connect-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .resource-list-label { margin: 12px 0 8px; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
      </style>
    `;
  }

  #renderDetail(provider: CommsCatalogItem): void {
    const connected = this.#connectedIds.has(provider.id);
    const resourceListSection = this.#resources !== null ? `<h3 class="resource-list-label"></h3><view-list></view-list>` : "";
    this.#root.innerHTML = `
      ${this.#sharedStyle()}
      <view-nav-header id="detail-header"><view-badge id="detail-badge"></view-badge></view-nav-header>
      ${provider.disclosure !== undefined ? `<p class="settings-disclosure"></p>` : ""}
      ${provider.tokenHint !== undefined ? `<p class="connect-hint">Get a real token: <code id="token-hint-command"></code> - expires in <span id="token-hint-expiry"></span>, re-run and reconnect once it does.</p>` : ""}
      <view-form></view-form><view-status-line></view-status-line>${resourceListSection}
    `;

    const header = this.#root.querySelector<NavHeaderView>("view-nav-header")!;
    header.appendChild(document.createTextNode(` ${provider.name}`));
    header.backLabel = this.#catalogLabel;
    header.addEventListener("nav-back", () => {
      this.#selectedProviderId = null;
      this.render();
    });
    const badge = this.#root.querySelector<BadgeView>("#detail-badge")!;
    badge.color = provider.color;
    badge.icon = provider.icon;
    if (provider.logo !== undefined) {
      badge.logo = provider.logo;
    }

    if (provider.disclosure !== undefined) {
      const disclosureEl = this.#root.querySelector(".settings-disclosure");
      if (disclosureEl) {
        disclosureEl.textContent = provider.disclosure;
      }
    }
    if (provider.tokenHint !== undefined) {
      const commandEl = this.#root.querySelector("#token-hint-command");
      const expiryEl = this.#root.querySelector("#token-hint-expiry");
      if (commandEl) {
        commandEl.textContent = provider.tokenHint.command;
      }
      if (expiryEl) {
        expiryEl.textContent = provider.tokenHint.expiry;
      }
    }

    const form = this.#root.querySelector<FormView>("view-form")!;
    form.fields = provider.fields;
    form.connecting = this.#connecting;
    form.connected = connected;
    form.addEventListener("submit", (e) => {
      void this.#handleSubmit(provider, (e as unknown as CustomEvent<{ values: Record<string, string> }>).detail.values);
    });
    form.addEventListener("disconnect", () => this.#handleDisconnect(provider));

    const status = this.#root.querySelector<StatusLineView>("view-status-line")!;
    status.text = this.#connecting ? "Connecting…" : this.#error ? `⚠️ ${this.#error}` : "";

    if (this.#resources !== null) {
      const labelEl = this.#root.querySelector(".resource-list-label");
      if (labelEl) {
        labelEl.textContent = provider.resourceListLabel;
      }
      const list = this.#root.querySelector<ListView>("view-list")!;
      // clickable is a private-field-backed accessor on ListView, not a
      // reflected HTML attribute - must be set via JS property
      // assignment, not inline in the template string above (same real
      // bug class as NavHeaderView's icon/title, justjs#124).
      list.clickable = true;
      list.items = this.#resources;
      list.addEventListener("item-select", (e) => {
        const id = (e as CustomEvent<{ id: string }>).detail.id;
        if (provider.hasChannelList) {
          this.#selectedParentId = id;
        } else {
          this.#selectedChannelId = id;
        }
        this.render();
      });
      this.#scheduleAutoRefresh();
    }
  }

  #renderChannels(provider: CommsCatalogItem): void {
    this.#root.innerHTML = `
      ${this.#sharedStyle()}
      <view-nav-header id="channels-header"><view-badge id="channels-badge"></view-badge> Channels</view-nav-header>
      <view-status-line></view-status-line>
      <view-list></view-list>
    `;
    const header = this.#root.querySelector<NavHeaderView>("#channels-header")!;
    header.backLabel = provider.name;
    header.addEventListener("nav-back", () => {
      this.#selectedParentId = null;
      this.#channels = null;
      this.#channelsError = null;
      this.render();
    });
    const badge = this.#root.querySelector<BadgeView>("#channels-badge")!;
    badge.color = provider.color;
    badge.icon = provider.icon;
    if (provider.logo !== undefined) {
      badge.logo = provider.logo;
    }

    const status = this.#root.querySelector<StatusLineView>("view-status-line")!;
    status.text = this.#channelsLoading ? "Loading…" : this.#channelsError ? `⚠️ ${this.#channelsError}` : "";

    const list = this.#root.querySelector<ListView>("view-list")!;
    list.clickable = true;
    if (this.#channels !== null) {
      list.items = this.#channels;
    }
    list.addEventListener("item-select", (e) => {
      this.#selectedChannelId = (e as CustomEvent<{ id: string }>).detail.id;
      this.render();
    });

    if (!this.#channels && !this.#channelsError && !this.#channelsLoading) {
      void this.#fetchChannels(provider);
    } else if (this.#channels) {
      this.#scheduleAutoRefresh();
    }
  }

  #renderMessages(provider: CommsCatalogItem): void {
    this.#root.innerHTML = `
      ${this.#sharedStyle()}
      <view-nav-header id="messages-header"><view-badge id="messages-badge"></view-badge> Messages</view-nav-header>
      <view-status-line></view-status-line>
      <view-list></view-list>
    `;
    const header = this.#root.querySelector<NavHeaderView>("#messages-header")!;
    header.backLabel = provider.hasChannelList ? "Channels" : provider.name;
    header.addEventListener("nav-back", () => {
      this.#selectedChannelId = null;
      this.#messages = null;
      this.#messagesError = null;
      this.render();
    });
    const badge = this.#root.querySelector<BadgeView>("#messages-badge")!;
    badge.color = provider.color;
    badge.icon = provider.icon;
    if (provider.logo !== undefined) {
      badge.logo = provider.logo;
    }

    const status = this.#root.querySelector<StatusLineView>("view-status-line")!;
    status.text = this.#messagesLoading ? "Loading…" : this.#messagesError ? `⚠️ ${this.#messagesError}` : "";

    const list = this.#root.querySelector<ListView>("view-list")!;
    list.emptyMessage = "No messages found.";
    if (this.#messages !== null) {
      list.items = this.#messages;
    }

    if (!this.#messages && !this.#messagesError && !this.#messagesLoading) {
      void this.#fetchMessages(provider);
    } else if (this.#messages) {
      this.#scheduleAutoRefresh();
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-comms-connector")) {
  customElements.define("control-comms-connector", CommsConnectorControl);
}
