import "@justjs/component-view";
import type { GridView, FormView, StatusLineView, ListView, ListItem, NavHeaderView, BadgeView } from "@justjs/component-view";
import type {
  ProviderCatalogItem,
  ConnectFunction,
  ListFunction,
  DisconnectFunction,
  OAuthBeginFunction,
  DeviceFlowBeginFunction,
} from "../api/provider_connector_control.js";

// Real Custom Element covering the common case ADR-0007 scoped: single-
// or two-field bearer-style credential form, provider grid -> tap ->
// form -> Connect -> resource list. Composes <view-grid>/<view-form>/
// <view-status-line>/<view-list>/<view-nav-header> from
// @justjs/component-view rather than hand-rendering its own steps -
// the caller supplies the actual network calls (connect/list/
// disconnect, already implemented per-package in each *-connect SAF);
// this element's own job is genuinely thin but real: track which step
// is current, call those functions at the right time, translate their
// results into props on the next view down. That real, owned
// sequencing is why this is a control, not a view, unlike every
// sibling element in this package family.
//
// Now covers Jira's real OAuth-redirect flow too (justjs#125, via
// oauthRedirect/oauthBegin) - ADR-0007's original exclusion was
// speculative ("we haven't built this yet"), not a permanent scope
// line; extended once a real migration needed it, same bar
// unsupportedMessage was held to. Still explicitly does NOT cover
// Cartoon's billed-generate flow - no cost-disclosure property, nothing
// invented for a case no consumer of this control has needed yet. A
// provider with `unsupportedMessage` set (a real third case found
// migrating Socials - X/LinkedIn's no-confirmed-CORS-access state)
// shows that message instead of a form, no connect()/list() ever
// called for it either.
export class ProviderConnectorControl extends HTMLElement {
  #providers: readonly ProviderCatalogItem[] = [];
  #connect: ConnectFunction | undefined;
  #list: ListFunction | undefined;
  #disconnect: DisconnectFunction | undefined;
  #oauthBegin: OAuthBeginFunction | undefined;
  #deviceFlowBegin: DeviceFlowBeginFunction | undefined;
  #catalogLabel = "";
  #selectedProviderId: string | null = null;
  #connecting = false;
  #error: string | null = null;
  #resources: readonly ListItem[] | null = null;
  readonly #connectedIds = new Set<string>();
  readonly #root: ShadowRoot;
  // Device-flow-only state (justjs#135). #deviceFlowSession holds the
  // real user code/URL to render while a poll is in flight, cleared once
  // it settles either way. #deviceFlowGeneration guards against a stale
  // poll (abandoned by reselecting a provider, tapping back, or
  // disconnecting) ever flipping `connected`/dispatching "connected" for
  // a screen nobody's watching anymore - every entry point that
  // abandons an attempt bumps this counter AND aborts the controller;
  // #handleDeviceFlowBegin checks the counter at each resume point and
  // simply returns if it's gone stale.
  #deviceFlowSession: { userCode: string; verificationUri: string } | null = null;
  #deviceFlowAbort: AbortController | null = null;
  #deviceFlowGeneration = 0;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get providers(): readonly ProviderCatalogItem[] {
    return this.#providers;
  }
  set providers(value: readonly ProviderCatalogItem[]) {
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

  set oauthBegin(fn: OAuthBeginFunction | undefined) {
    this.#oauthBegin = fn;
  }

  set deviceFlowBegin(fn: DeviceFlowBeginFunction | undefined) {
    this.#deviceFlowBegin = fn;
  }

  get catalogLabel(): string {
    return this.#catalogLabel;
  }
  set catalogLabel(value: string) {
    this.#catalogLabel = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  #findProvider(id: string | null): ProviderCatalogItem | undefined {
    return this.#providers.find((p) => p.id === id);
  }

  async #handleSubmit(provider: ProviderCatalogItem, values: Readonly<Record<string, string>>): Promise<void> {
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

  // oauthRedirect's own re-verify path (justjs#125) - unlike
  // #handleSubmit, there's no `connect()` call to produce a session:
  // the caller's own list() reads whatever persisted session it already
  // has (e.g. getStoredJiraSession()) directly, matching the original
  // handleJiraResourceFetch()'s own shape before this migration.
  async #fetchList(provider: ProviderCatalogItem): Promise<void> {
    this.#connecting = true;
    this.#error = null;
    this.render();
    try {
      this.#resources = (await this.#list?.(provider.id, undefined)) ?? [];
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

  // Real, synchronous browser navigation (justjs#125) - never awaited,
  // the page unloads before there's anything else to do. A thrown
  // validation error (e.g. missing fields) is the only outcome this
  // control ever actually observes, shown via the same status line
  // #handleSubmit's own catch path already uses. Deliberately does NOT
  // re-render on success (matches the original handleJiraOAuthBegin()'s
  // own shape exactly - it only ever called renderView() on its early
  // validation-error return, never after a real beginJiraConnect()
  // call) - a real bug caught writing this migration's own keep-alive
  // test: re-rendering here would rebuild <view-form> from this
  // `provider` object's still-stale `fields` (computed before
  // oauthBegin's own side effect, e.g. persisting the just-typed
  // credentials, could be reflected in a fresh toCatalogItem() call),
  // wiping the exact values the user just typed and submitted.
  #handleOAuthBegin(provider: ProviderCatalogItem, values: Readonly<Record<string, string>>): void {
    try {
      this.#oauthBegin?.(provider.id, values);
      this.#error = null;
    } catch (e) {
      this.#error = e instanceof Error ? e.message : String(e);
      this.dispatchEvent(
        new CustomEvent("error", { detail: { providerId: provider.id, message: this.#error }, bubbles: true, composed: true })
      );
      this.render();
    }
  }

  #handleDisconnect(provider: ProviderCatalogItem): void {
    this.#abandonDeviceFlow();
    this.#disconnect?.(provider.id);
    this.#connectedIds.delete(provider.id);
    this.#resources = null;
    this.#error = null;
    this.render();
  }

  // Bumps the generation counter and aborts any in-flight device-flow
  // poll - called from every point the user leaves a pending attempt
  // behind (reselecting a provider, tapping back, disconnecting) so a
  // stale poll resolving later can never flip `connected`/dispatch
  // "connected" for a screen nobody's watching anymore. Cheap/no-op when
  // no device flow is in progress.
  #abandonDeviceFlow(): void {
    this.#deviceFlowGeneration++;
    this.#deviceFlowAbort?.abort();
    this.#deviceFlowAbort = null;
    this.#deviceFlowSession = null;
  }

  // justjs#135 - device flow's own Connect handler. Unlike
  // #handleOAuthBegin (fire-and-forget navigation, page unloads), this
  // stays on screen the whole time: request the code, render it
  // immediately, await the background poll, then replicate
  // #handleSubmit's own connect-then-list tail once a real token exists,
  // so behavior matches the plain-bearer path exactly from that point
  // on. Re-rendering after the code arrives is correct here (unlike
  // #handleOAuthBegin's deliberate no-rerender rule, which exists only
  // to protect just-typed fields from a page unload that never happens
  // in this flow, and deviceFlow providers have no fields to protect
  // anyway).
  async #handleDeviceFlowBegin(provider: ProviderCatalogItem): Promise<void> {
    this.#abandonDeviceFlow();
    const controller = new AbortController();
    this.#deviceFlowAbort = controller;
    const generation = this.#deviceFlowGeneration;
    this.#connecting = true;
    this.#error = null;
    this.render();
    try {
      const handle = await this.#deviceFlowBegin?.(provider.id, controller.signal);
      if (generation !== this.#deviceFlowGeneration || !handle) {
        return;
      }
      this.#deviceFlowSession = { userCode: handle.userCode, verificationUri: handle.verificationUri };
      this.render();
      const token = await handle.token;
      if (generation !== this.#deviceFlowGeneration) {
        return;
      }
      const session = await this.#connect?.(provider.id, { token });
      if (generation !== this.#deviceFlowGeneration) {
        return;
      }
      this.#connectedIds.add(provider.id);
      this.dispatchEvent(new CustomEvent("connected", { detail: { providerId: provider.id }, bubbles: true, composed: true }));
      this.#resources = (await this.#list?.(provider.id, session)) ?? [];
    } catch (e) {
      if (generation !== this.#deviceFlowGeneration) {
        return;
      }
      this.#error = e instanceof Error ? e.message : String(e);
      this.dispatchEvent(
        new CustomEvent("error", { detail: { providerId: provider.id, message: this.#error }, bubbles: true, composed: true })
      );
    } finally {
      if (generation === this.#deviceFlowGeneration) {
        this.#connecting = false;
        this.#deviceFlowSession = null;
        this.render();
      }
    }
  }

  // Matches every existing screen's own lazy-validation posture: a
  // provider already connected in a previous session, revisited with
  // nothing fetched yet this visit, auto-fetches instead of waiting
  // for an explicit re-click - checked directly in socials.ts/
  // workspace.ts/communication.ts before porting, not assumed.
  #maybeAutoConnect(provider: ProviderCatalogItem): void {
    if (this.#connectedIds.has(provider.id) && this.#resources === null && !this.#connecting && !this.#error) {
      if (provider.oauthRedirect || provider.deviceFlow) {
        void this.#fetchList(provider);
      } else {
        void this.#handleSubmit(provider, {});
      }
    }
  }

  private render(): void {
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
        ...(p.icon !== undefined ? { icon: p.icon } : {}),
        badgeColor: p.color,
        ...(p.logo !== undefined ? { badgeLogo: p.logo } : {}),
        ...(connected ? { status: "✓ Connected" } : {}),
        selected: connected,
      };
    });
    grid.addEventListener("item-select", (e) => {
      this.#abandonDeviceFlow();
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

  #renderDetail(provider: ProviderCatalogItem): void {
    const connected = this.#connectedIds.has(provider.id);
    const unsupported = provider.unsupportedMessage !== undefined;
    const resourceListSection =
      !unsupported && this.#resources !== null
        ? `${provider.resourceListLabel !== undefined ? `<h3 class="resource-list-label"></h3>` : ""}<view-list></view-list>`
        : "";
    // Same "plain template block, no new shared view component" precedent
    // .connect-hint already established for unsupportedMessage - shown
    // only while a device-flow poll actually has a real code/URL to
    // display (never for the other 2 modes, never before the code
    // arrives).
    // href/text content are set via safe DOM properties below, never
    // interpolated into this template string - verificationUri/userCode
    // come from a real external API response (GitHub's), same "never
    // trust external data into innerHTML" rule this control's own
    // provider.name/disclosure text already follows via
    // appendChild(createTextNode(...))/.textContent.
    const deviceFlowSection =
      provider.deviceFlow && this.#deviceFlowSession
        ? `<p class="device-flow-code">Go to <a class="device-flow-link" target="_blank" rel="noopener noreferrer"></a> and enter code <strong class="device-flow-user-code"></strong></p>`
        : "";
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .settings-disclosure { margin: 0 0 10px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .connect-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .resource-list-label { margin: 12px 0 8px; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
        .device-flow-code { margin: 0 0 14px; font-size: 13px; line-height: 1.5; color: var(--text); }
      </style>
      <view-nav-header id="detail-header"><view-badge id="detail-badge"></view-badge></view-nav-header>
      ${provider.disclosure !== undefined ? `<p class="settings-disclosure"></p>` : ""}
      ${deviceFlowSection}
      ${unsupported ? `<p class="connect-hint"></p>` : `<view-form></view-form><view-status-line></view-status-line>${resourceListSection}`}
    `;

    const header = this.#root.querySelector<NavHeaderView>("view-nav-header")!;
    header.appendChild(document.createTextNode(` ${provider.name}`));
    header.backLabel = this.#catalogLabel;
    header.addEventListener("nav-back", () => {
      this.#abandonDeviceFlow();
      this.#selectedProviderId = null;
      this.render();
    });
    if (provider.deviceFlow && this.#deviceFlowSession) {
      const linkEl = this.#root.querySelector<HTMLAnchorElement>(".device-flow-link");
      if (linkEl) {
        linkEl.href = this.#deviceFlowSession.verificationUri;
        linkEl.textContent = this.#deviceFlowSession.verificationUri;
      }
      const codeEl = this.#root.querySelector(".device-flow-user-code");
      if (codeEl) {
        codeEl.textContent = this.#deviceFlowSession.userCode;
      }
    }
    const badge = this.#root.querySelector<BadgeView>("#detail-badge")!;
    badge.color = provider.color;
    if (provider.icon !== undefined) {
      badge.icon = provider.icon;
    }
    if (provider.logo !== undefined) {
      badge.logo = provider.logo;
    }

    if (provider.disclosure !== undefined) {
      const disclosureEl = this.#root.querySelector(".settings-disclosure");
      if (disclosureEl) {
        disclosureEl.textContent = provider.disclosure;
      }
    }

    if (unsupported) {
      const hintEl = this.#root.querySelector(".connect-hint");
      if (hintEl) {
        hintEl.textContent = provider.unsupportedMessage ?? "";
      }
      return;
    }

    const form = this.#root.querySelector<FormView>("view-form")!;
    form.fields = provider.fields;
    form.connecting = this.#connecting;
    form.connected = connected;
    form.addEventListener("submit", (e) => {
      const values = (e as unknown as CustomEvent<{ values: Record<string, string> }>).detail.values;
      if (provider.deviceFlow) {
        void this.#handleDeviceFlowBegin(provider);
        return;
      }
      if (provider.oauthRedirect) {
        this.#handleOAuthBegin(provider, values);
        return;
      }
      void this.#handleSubmit(provider, values);
    });
    form.addEventListener("disconnect", () => this.#handleDisconnect(provider));

    const status = this.#root.querySelector<StatusLineView>("view-status-line")!;
    status.text =
      provider.deviceFlow && this.#deviceFlowSession
        ? "Waiting for you to finish on GitHub…"
        : this.#connecting
          ? "Connecting…"
          : this.#error
            ? `⚠️ ${this.#error}`
            : "";

    if (provider.resourceListLabel !== undefined && this.#resources !== null) {
      const labelEl = this.#root.querySelector(".resource-list-label");
      if (labelEl) {
        labelEl.textContent = provider.resourceListLabel;
      }
    }
    const list = this.#root.querySelector<ListView>("view-list");
    if (list && this.#resources !== null) {
      list.items = this.#resources;
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-provider-connector")) {
  customElements.define("control-provider-connector", ProviderConnectorControl);
}
