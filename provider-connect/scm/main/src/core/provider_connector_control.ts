import "@justjs/component-view";
import type { GridView, FormView, StatusLineView, ListView, ListItem } from "@justjs/component-view";
import type {
  ProviderCatalogItem,
  ConnectFunction,
  ListFunction,
  DisconnectFunction,
} from "../api/provider_connector_control.js";

// Real Custom Element covering the common case ADR-0007 scoped: single-
// or two-field bearer-style credential form, provider grid -> tap ->
// form -> Connect -> resource list. Composes <view-grid>/<view-form>/
// <view-status-line>/<view-list> from @justjs/component-view rather
// than hand-rendering its own steps - the caller supplies the actual
// network calls (connect/list/disconnect, already implemented
// per-package in each *-connect SAF); this element's own job is
// genuinely thin but real: track which step is current, call those
// functions at the right time, translate their results into props on
// the next view down. That real, owned sequencing is why this is a
// control, not a view, unlike every sibling element in this package
// family.
//
// Explicitly does NOT cover Jira's OAuth-redirect flow or Cartoon's
// billed-generate flow (ADR-0007's own exclusions) - no dead config
// surface for either: no redirect-URL property, no cost-disclosure
// property, nothing invented for cases this element doesn't handle.
export class ProviderConnectorControl extends HTMLElement {
  #providers: readonly ProviderCatalogItem[] = [];
  #connect: ConnectFunction | undefined;
  #list: ListFunction | undefined;
  #disconnect: DisconnectFunction | undefined;
  #selectedProviderId: string | null = null;
  #connecting = false;
  #error: string | null = null;
  #resources: readonly ListItem[] | null = null;
  readonly #connectedIds = new Set<string>();
  readonly #root: ShadowRoot;

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

  #handleDisconnect(provider: ProviderCatalogItem): void {
    this.#disconnect?.(provider.id);
    this.#connectedIds.delete(provider.id);
    this.#resources = null;
    this.#error = null;
    this.render();
  }

  // Matches every existing screen's own lazy-validation posture: a
  // provider already connected in a previous session, revisited with
  // nothing fetched yet this visit, auto-fetches instead of waiting
  // for an explicit re-click - checked directly in socials.ts/
  // workspace.ts/communication.ts before porting, not assumed.
  #maybeAutoConnect(provider: ProviderCatalogItem): void {
    if (this.#connectedIds.has(provider.id) && this.#resources === null && !this.#connecting && !this.#error) {
      void this.#handleSubmit(provider, {});
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
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .back-btn {
          border: none;
          padding: 8px 14px;
          margin-bottom: 10px;
          font-size: 13px;
          font-family: inherit;
          font-weight: 600;
          border-radius: var(--radius-pill);
          background: color-mix(in srgb, var(--stage-color, var(--accent)) 16%, var(--surface-alt));
          color: var(--text);
          cursor: pointer;
        }
      </style>
      <button type="button" class="back-btn">← Back</button>
      <view-form></view-form>
      <view-status-line></view-status-line>
      ${this.#resources !== null ? "<view-list></view-list>" : ""}
    `;
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

    const list = this.#root.querySelector<ListView>("view-list");
    if (list && this.#resources !== null) {
      list.items = this.#resources;
    }

    this.#root.querySelector(".back-btn")?.addEventListener("click", () => {
      this.#selectedProviderId = null;
      this.render();
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-provider-connector")) {
  customElements.define("control-provider-connector", ProviderConnectorControl);
}
