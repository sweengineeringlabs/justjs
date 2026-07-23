// AUTO-GENERATED — do not edit. Regenerate with: jsc dom communication_component.yaml
// Source: communication_component.yaml (version 1)

export class CommunicationBase extends HTMLElement {
  static readonly tagName = 'js-communication';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references (private; read-only externally, ADR-0012) ──────────────────────────────────
  // Getter-only stops reassignment (element.button = x); the returned
  // element itself remains a live, mutable DOM node — this does not
  // freeze attributes/children/listeners on what the getter returns.
  #root!: HTMLElement;
  get root(): HTMLElement { return this.#root; }
  #connector!: HTMLElement;
  get connector(): HTMLElement {
    if (!this.#connector) {
      throw new Error(`[justweb] 'connector' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#connector;
  }
  #mainView!: HTMLDivElement;
  get mainView(): HTMLDivElement {
    if (!this.#mainView) {
      throw new Error(`[justweb] 'mainView' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#mainView;
  }
  #settingAutoRead!: HTMLInputElement;
  get settingAutoRead(): HTMLInputElement {
    if (!this.#settingAutoRead) {
      throw new Error(`[justweb] 'settingAutoRead' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#settingAutoRead;
  }
  #settingDefaultProvider!: HTMLSelectElement;
  get settingDefaultProvider(): HTMLSelectElement {
    if (!this.#settingDefaultProvider) {
      throw new Error(`[justweb] 'settingDefaultProvider' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#settingDefaultProvider;
  }
  #settingHideArchived!: HTMLInputElement;
  get settingHideArchived(): HTMLInputElement {
    if (!this.#settingHideArchived) {
      throw new Error(`[justweb] 'settingHideArchived' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#settingHideArchived;
  }
  #settingRefreshInterval!: HTMLSelectElement;
  get settingRefreshInterval(): HTMLSelectElement {
    if (!this.#settingRefreshInterval) {
      throw new Error(`[justweb] 'settingRefreshInterval' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#settingRefreshInterval;
  }
  #settingsBackBtn!: HTMLButtonElement;
  get settingsBackBtn(): HTMLButtonElement {
    if (!this.#settingsBackBtn) {
      throw new Error(`[justweb] 'settingsBackBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#settingsBackBtn;
  }
  #settingsBtn!: HTMLButtonElement;
  get settingsBtn(): HTMLButtonElement {
    if (!this.#settingsBtn) {
      throw new Error(`[justweb] 'settingsBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#settingsBtn;
  }
  #settingsView!: HTMLDivElement;
  get settingsView(): HTMLDivElement {
    if (!this.#settingsView) {
      throw new Error(`[justweb] 'settingsView' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#settingsView;
  }

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;
  // ── DDAS integrity observer (ADR-0012) ──────────────
  private _ddasIntegrityObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.#root = this as unknown as HTMLElement;
    this.classList.add('communication');

    // Bind light-DOM children + DDAS stamps.
    this._bindElements();
    if (!this._hasAllElements()) {
      this._lightDomObserver = new MutationObserver(() => {
        this._bindElements();
        if (this._hasAllElements() && this._lightDomObserver) {
          this._lightDomObserver.disconnect();
          this._lightDomObserver = null;
          this._watchDdasIntegrity();
        }
      });
      this._lightDomObserver.observe(this, { childList: true, subtree: true });
    } else {
      this._watchDdasIntegrity();
    }
  }

  disconnectedCallback(): void {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
    if (this._lightDomObserver) {
      this._lightDomObserver.disconnect();
      this._lightDomObserver = null;
    }
    if (this._ddasIntegrityObserver) {
      this._ddasIntegrityObserver.disconnect();
      this._ddasIntegrityObserver = null;
    }
  }

  public refresh(): void {
    this._bindElements();
  }

  private _bindElements(): void {
    if (!this.#connector) {
      const __el = this.querySelector('[data-part="connector"]') as HTMLElement | null;
      if (__el) {
        this.#connector = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:connector');
      }
    }
    if (!this.#mainView) {
      const __el = this.querySelector('[data-part="main-view"]') as HTMLDivElement | null;
      if (__el) {
        this.#mainView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:main-view');
      }
    }
    if (!this.#settingAutoRead) {
      const __el = this.querySelector('[data-part="setting-auto-read"]') as HTMLInputElement | null;
      if (__el) {
        this.#settingAutoRead = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:setting-auto-read');
      }
    }
    if (!this.#settingDefaultProvider) {
      const __el = this.querySelector('[data-part="setting-default-provider"]') as HTMLSelectElement | null;
      if (__el) {
        this.#settingDefaultProvider = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:setting-default-provider');
      }
    }
    if (!this.#settingHideArchived) {
      const __el = this.querySelector('[data-part="setting-hide-archived"]') as HTMLInputElement | null;
      if (__el) {
        this.#settingHideArchived = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:setting-hide-archived');
      }
    }
    if (!this.#settingRefreshInterval) {
      const __el = this.querySelector('[data-part="setting-refresh-interval"]') as HTMLSelectElement | null;
      if (__el) {
        this.#settingRefreshInterval = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:setting-refresh-interval');
      }
    }
    if (!this.#settingsBackBtn) {
      const __el = this.querySelector('[data-part="settings-back-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#settingsBackBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:settings-back-btn');
      }
    }
    if (!this.#settingsBtn) {
      const __el = this.querySelector('[data-part="settings-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#settingsBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:settings-btn');
      }
    }
    if (!this.#settingsView) {
      const __el = this.querySelector('[data-part="settings-view"]') as HTMLDivElement | null;
      if (__el) {
        this.#settingsView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:communication:communication:settings-view');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.#connector && !!this.#mainView && !!this.#settingAutoRead && !!this.#settingDefaultProvider && !!this.#settingHideArchived && !!this.#settingRefreshInterval && !!this.#settingsBackBtn && !!this.#settingsBtn && !!this.#settingsView;
  }

  private _watchDdasIntegrity(): void {
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    const __observer = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.type !== 'attributes' || rec.attributeName !== 'data-ddas-id') continue;
        const __target = rec.target as Element;
        const __current = __target.getAttribute('data-ddas-id');
        if (__current === rec.oldValue) continue;
        const __msg = `[justweb] data-ddas-id mutated or removed on <${__target.tagName.toLowerCase()}> (was '${rec.oldValue}', now '${__current}')`;
        if (__strict) { throw new Error(__msg); }
        console.warn(__msg);
      }
    });
    __observer.observe(this, { attributes: true, attributeFilter: ['data-ddas-id'], subtree: true, attributeOldValue: true });
    this._ddasIntegrityObserver = __observer;
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
