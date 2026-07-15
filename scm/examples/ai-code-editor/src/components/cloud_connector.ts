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

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export interface CloudCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly logo?: string;
  readonly connected: boolean;
  // Empty for kind:"unsupported" - matches ProviderConnectorControl's
  // own unsupportedMessage convention exactly.
  readonly fields: readonly FormField[];
  readonly disclosure?: string;
  // Azure/GCP only: the real local CLI command to run for a short-lived
  // token, shown verbatim (rendered in <code>, structured rather than a
  // pre-formatted string, so the control never needs innerHTML/escaping
  // for host-supplied text).
  readonly tokenHint?: { readonly command: string; readonly expiry: string };
  readonly unsupportedMessage?: string;
  readonly resourceListLabel?: string;
  // AWS-only opt-in second action, separate from the main connect
  // (needs the real ec2:DescribeInstances permission, unlike
  // GetCallerIdentity) - a second, independently-loading <view-list>,
  // not a variant of the first.
  readonly hasListInstances?: boolean;
  // Netlify/Vercel/Heroku-only opt-in action - a one-shot button +
  // status + result link, not a list at all. Orthogonal to `fields`'
  // shape (all 3 stay single-bearer-token).
  readonly hasDeploy?: boolean;
}

export type ConnectFunction = (providerId: string, values: Readonly<Record<string, string>>) => Promise<unknown>;
export type ListFunction = (providerId: string, session: unknown) => Promise<readonly ListItem[]>;
export type DisconnectFunction = (providerId: string) => void;
export type ListInstancesFunction = (providerId: string) => Promise<readonly ListItem[]>;
export type DeployFunction = (providerId: string) => Promise<{ readonly url: string }>;

// Real Custom Element for Deployment's Cloud providers (justjs#126,
// part of justjs#119's decomposition). Same "provider grid -> tap ->
// form -> Connect -> resource list" shape ProviderConnectorControl
// already covers (composes the same view-grid/view-form/
// view-status-line/view-list/view-nav-header primitives, same "caller
// supplies the actual network calls" split) - but Cloud has two real
// extra actions ProviderConnectorControl was never built to model
// (AWS's opt-in List EC2 Instances, three providers' opt-in Deploy),
// each a structurally different shape (a second independent list; a
// one-shot button+result-link, not a list at all) from just 2 real
// call sites - not broad enough to justify a generic "extra actions"
// slot on the shared provider-connect package (that would mean
// designing a plugin surface for hypothetical future shapes no real
// consumer has asked for). A real sibling, not a forced reuse.
export class CloudConnectorControl extends HTMLElement {
  #providers: readonly CloudCatalogItem[] = [];
  #connect: ConnectFunction | undefined;
  #list: ListFunction | undefined;
  #disconnect: DisconnectFunction | undefined;
  #listInstances: ListInstancesFunction | undefined;
  #deploy: DeployFunction | undefined;
  #catalogLabel = "";
  #selectedProviderId: string | null = null;
  #connecting = false;
  #error: string | null = null;
  #resources: readonly ListItem[] | null = null;
  #instancesLoading = false;
  #instancesError: string | null = null;
  #instances: readonly ListItem[] | null = null;
  #deploying = false;
  #deployError: string | null = null;
  #deployResult: { readonly url: string } | null = null;
  readonly #connectedIds = new Set<string>();
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get providers(): readonly CloudCatalogItem[] {
    return this.#providers;
  }
  set providers(value: readonly CloudCatalogItem[]) {
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
  set listInstances(fn: ListInstancesFunction | undefined) {
    this.#listInstances = fn;
  }
  set deploy(fn: DeployFunction | undefined) {
    this.#deploy = fn;
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

  #findProvider(id: string | null): CloudCatalogItem | undefined {
    return this.#providers.find((p) => p.id === id);
  }

  #resetDetailState(): void {
    this.#error = null;
    this.#resources = null;
    this.#instancesLoading = false;
    this.#instancesError = null;
    this.#instances = null;
    this.#deploying = false;
    this.#deployError = null;
    this.#deployResult = null;
  }

  async #handleSubmit(provider: CloudCatalogItem, values: Readonly<Record<string, string>>): Promise<void> {
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

  #handleDisconnect(provider: CloudCatalogItem): void {
    this.#disconnect?.(provider.id);
    this.#connectedIds.delete(provider.id);
    this.#resetDetailState();
    this.render();
  }

  async #handleListInstances(provider: CloudCatalogItem): Promise<void> {
    this.#instancesLoading = true;
    this.#instancesError = null;
    this.render();
    try {
      this.#instances = (await this.#listInstances?.(provider.id)) ?? [];
    } catch (e) {
      this.#instancesError = e instanceof Error ? e.message : String(e);
      this.#instances = null;
    } finally {
      this.#instancesLoading = false;
      this.render();
    }
  }

  async #handleDeploy(provider: CloudCatalogItem): Promise<void> {
    this.#deploying = true;
    this.#deployError = null;
    this.render();
    try {
      this.#deployResult = (await this.#deploy?.(provider.id)) ?? null;
      this.#deployError = null;
    } catch (e) {
      this.#deployError = e instanceof Error ? e.message : String(e);
      this.#deployResult = null;
    } finally {
      this.#deploying = false;
      this.render();
    }
  }

  // Matches every existing screen's own lazy-validation posture: a
  // provider already connected in a previous session, revisited with
  // nothing fetched yet this visit, auto-fetches instead of waiting
  // for an explicit re-click.
  #maybeAutoConnect(provider: CloudCatalogItem): void {
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
      this.#resetDetailState();
      this.render();
      const provider = this.#findProvider(id);
      if (provider) {
        this.#maybeAutoConnect(provider);
      }
    });
  }

  #renderDetail(provider: CloudCatalogItem): void {
    const connected = this.#connectedIds.has(provider.id);
    const unsupported = provider.unsupportedMessage !== undefined;
    const mainListSection =
      !unsupported && this.#resources !== null
        ? `${provider.resourceListLabel !== undefined ? `<h3 class="resource-list-label"></h3>` : ""}<view-list id="main-list"></view-list>`
        : "";
    // Both extra actions are gated on a real successful connect first
    // (this.#resources !== null), same as the original
    // renderCloudResourceList()'s own early return - List EC2 Instances/
    // Deploy never show for a provider that hasn't connected yet.
    const listInstancesSection = !unsupported && provider.hasListInstances && this.#resources !== null
      ? `
          <div class="connect-actions">
            <button id="list-instances-btn" type="button" class="btn-secondary"></button>
          </div>
          <view-status-line id="instances-status"></view-status-line>
          <view-list id="instances-list" hidden></view-list>
        `
      : "";
    const deploySection = !unsupported && provider.hasDeploy && this.#resources !== null
      ? `
          <div class="connect-actions">
            <button id="deploy-btn" type="button" class="btn-secondary"></button>
          </div>
          <view-status-line id="deploy-status"></view-status-line>
          <p id="deploy-result" class="connect-hint" hidden></p>
        `
      : "";
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .settings-disclosure { margin: 0 0 10px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .connect-hint { margin: 0 0 14px; font-size: 12px; line-height: 1.4; color: var(--text-muted); }
        .resource-list-label { margin: 12px 0 8px; font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em; }
        .connect-actions { display: flex; gap: 10px; margin: 14px 0 0; }
        button.btn-secondary {
          flex: 1;
          border: none;
          padding: 10px 18px;
          font-size: 14px;
          font-family: inherit;
          font-weight: 600;
          border-radius: var(--radius-pill);
          background: var(--surface-alt);
          color: var(--text);
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.05s ease;
        }
        button.btn-secondary:active { transform: scale(0.97); opacity: 0.85; }
        button.btn-secondary:disabled { opacity: 0.5; cursor: default; }
        @media (hover: hover) and (pointer: fine) {
          button.btn-secondary:hover:not(:disabled) { opacity: 0.9; }
        }
        a { color: var(--accent-strong); }
      </style>
      <view-nav-header id="detail-header"><view-badge id="detail-badge"></view-badge></view-nav-header>
      ${provider.disclosure !== undefined ? `<p class="settings-disclosure"></p>` : ""}
      ${provider.tokenHint !== undefined ? `<p class="connect-hint">Get a real token: <code id="token-hint-command"></code> - expires in <span id="token-hint-expiry"></span>, re-run and reconnect once it does.</p>` : ""}
      ${unsupported ? `<p class="connect-hint"></p>` : `<view-form></view-form><view-status-line></view-status-line>${mainListSection}${listInstancesSection}${deploySection}`}
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
      void this.#handleSubmit(provider, (e as unknown as CustomEvent<{ values: Record<string, string> }>).detail.values);
    });
    form.addEventListener("disconnect", () => this.#handleDisconnect(provider));

    const status = this.#root.querySelector<StatusLineView>("view-status-line")!;
    status.text = this.#connecting ? "Connecting…" : this.#error ? `⚠️ ${this.#error}` : "";

    if (provider.resourceListLabel !== undefined && this.#resources !== null) {
      const labelEl = this.#root.querySelector(".resource-list-label");
      if (labelEl) {
        labelEl.textContent = provider.resourceListLabel;
      }
    }
    const mainList = this.#root.querySelector<ListView>("#main-list");
    if (mainList && this.#resources !== null) {
      mainList.items = this.#resources;
    }

    if (provider.hasListInstances && this.#resources !== null) {
      const btn = this.#root.querySelector<HTMLButtonElement>("#list-instances-btn")!;
      btn.textContent = this.#instancesLoading ? "Loading…" : "List EC2 Instances (needs ec2:DescribeInstances)";
      btn.disabled = this.#instancesLoading;
      btn.addEventListener("click", () => void this.#handleListInstances(provider));
      const instancesStatus = this.#root.querySelector<StatusLineView>("#instances-status")!;
      instancesStatus.text = this.#instancesError ? `⚠️ ${this.#instancesError}` : "";
      const instancesList = this.#root.querySelector<ListView>("#instances-list")!;
      instancesList.emptyMessage = "No EC2 instances found in us-east-1.";
      if (this.#instances !== null) {
        instancesList.items = this.#instances;
      } else {
        instancesList.hidden = true;
      }
    }

    if (provider.hasDeploy && this.#resources !== null) {
      const btn = this.#root.querySelector<HTMLButtonElement>("#deploy-btn")!;
      btn.textContent = this.#deploying ? "Deploying…" : "Deploy this project";
      btn.disabled = this.#deploying;
      btn.addEventListener("click", () => void this.#handleDeploy(provider));
      const deployStatus = this.#root.querySelector<StatusLineView>("#deploy-status")!;
      deployStatus.text = this.#deployError ? `⚠️ ${this.#deployError}` : "";
      const resultEl = this.#root.querySelector<HTMLElement>("#deploy-result")!;
      if (this.#deployResult) {
        resultEl.hidden = false;
        resultEl.innerHTML = `✓ Deployed - <a href="${escapeHtml(this.#deployResult.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(this.#deployResult.url)}</a>`;
      } else {
        resultEl.hidden = true;
      }
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-cloud-connector")) {
  customElements.define("control-cloud-connector", CloudConnectorControl);
}
