// AUTO-GENERATED — do not edit. Regenerate with: jsc dom communication_component.yaml
// Source: communication_component.yaml (version 1)

export class CommunicationBase extends HTMLElement {
  static readonly tagName = 'js-communication';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLElement;
  protected connector!: HTMLElement;
  protected mainView!: HTMLDivElement;
  protected settingAutoRead!: HTMLInputElement;
  protected settingDefaultProvider!: HTMLSelectElement;
  protected settingHideArchived!: HTMLInputElement;
  protected settingRefreshInterval!: HTMLSelectElement;
  protected settingsBackBtn!: HTMLButtonElement;
  protected settingsBtn!: HTMLButtonElement;
  protected settingsView!: HTMLDivElement;

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.root = this as unknown as HTMLElement;
    this.classList.add('communication');

    // Bind light-DOM children + DDAS stamps.
    this._bindElements();
    if (!this._hasAllElements()) {
      this._lightDomObserver = new MutationObserver(() => {
        this._bindElements();
        if (this._hasAllElements() && this._lightDomObserver) {
          this._lightDomObserver.disconnect();
          this._lightDomObserver = null;
        }
      });
      this._lightDomObserver.observe(this, { childList: true, subtree: true });
    }
  }

  disconnectedCallback(): void {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
    if (this._lightDomObserver) {
      this._lightDomObserver.disconnect();
      this._lightDomObserver = null;
    }
  }

  public refresh(): void {
    this._bindElements();
  }

  private _bindElements(): void {
    if (!this.connector) {
      const __el = this.querySelector('[data-part="connector"]') as HTMLElement | null;
      if (__el) {
        this.connector = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:connector');
      }
    }
    if (!this.mainView) {
      const __el = this.querySelector('[data-part="main-view"]') as HTMLDivElement | null;
      if (__el) {
        this.mainView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:main-view');
      }
    }
    if (!this.settingAutoRead) {
      const __el = this.querySelector('[data-part="setting-auto-read"]') as HTMLInputElement | null;
      if (__el) {
        this.settingAutoRead = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:setting-auto-read');
      }
    }
    if (!this.settingDefaultProvider) {
      const __el = this.querySelector('[data-part="setting-default-provider"]') as HTMLSelectElement | null;
      if (__el) {
        this.settingDefaultProvider = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:setting-default-provider');
      }
    }
    if (!this.settingHideArchived) {
      const __el = this.querySelector('[data-part="setting-hide-archived"]') as HTMLInputElement | null;
      if (__el) {
        this.settingHideArchived = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:setting-hide-archived');
      }
    }
    if (!this.settingRefreshInterval) {
      const __el = this.querySelector('[data-part="setting-refresh-interval"]') as HTMLSelectElement | null;
      if (__el) {
        this.settingRefreshInterval = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:setting-refresh-interval');
      }
    }
    if (!this.settingsBackBtn) {
      const __el = this.querySelector('[data-part="settings-back-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.settingsBackBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:settings-back-btn');
      }
    }
    if (!this.settingsBtn) {
      const __el = this.querySelector('[data-part="settings-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.settingsBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:settings-btn');
      }
    }
    if (!this.settingsView) {
      const __el = this.querySelector('[data-part="settings-view"]') as HTMLDivElement | null;
      if (__el) {
        this.settingsView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:settings-view');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.connector && !!this.mainView && !!this.settingAutoRead && !!this.settingDefaultProvider && !!this.settingHideArchived && !!this.settingRefreshInterval && !!this.settingsBackBtn && !!this.settingsBtn && !!this.settingsView;
  }
}

if (typeof customElements === 'object' && customElements !== null && typeof customElements.define === 'function') {
  const __existing = customElements.get('js-communication');
  if (!__existing) {
    customElements.define('js-communication', CommunicationBase);
  } else if (__existing !== CommunicationBase) {
    const __msg = "[justweb] custom element 'js-communication' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
