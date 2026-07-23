// AUTO-GENERATED — do not edit. Regenerate with: jsc dom cartoon_component.yaml
// Source: cartoon_component.yaml (version 1)

export class CartoonBase extends HTMLElement {
  static readonly tagName = 'js-cartoon';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references (private; read-only externally, ADR-0012) ──────────────────────────────────
  // Getter-only stops reassignment (element.button = x); the returned
  // element itself remains a live, mutable DOM node — this does not
  // freeze attributes/children/listeners on what the getter returns.
  #root!: HTMLElement;
  get root(): HTMLElement { return this.#root; }
  #backBtn!: HTMLButtonElement;
  get backBtn(): HTMLButtonElement {
    if (!this.#backBtn) {
      throw new Error(`[justweb] 'backBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#backBtn;
  }
  #connectBtn!: HTMLButtonElement;
  get connectBtn(): HTMLButtonElement {
    if (!this.#connectBtn) {
      throw new Error(`[justweb] 'connectBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#connectBtn;
  }
  #connectDisclosure!: HTMLParagraphElement;
  get connectDisclosure(): HTMLParagraphElement {
    if (!this.#connectDisclosure) {
      throw new Error(`[justweb] 'connectDisclosure' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#connectDisclosure;
  }
  #connectStatus!: HTMLParagraphElement;
  get connectStatus(): HTMLParagraphElement {
    if (!this.#connectStatus) {
      throw new Error(`[justweb] 'connectStatus' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#connectStatus;
  }
  #connectToken!: HTMLInputElement;
  get connectToken(): HTMLInputElement {
    if (!this.#connectToken) {
      throw new Error(`[justweb] 'connectToken' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#connectToken;
  }
  #detailView!: HTMLDivElement;
  get detailView(): HTMLDivElement {
    if (!this.#detailView) {
      throw new Error(`[justweb] 'detailView' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#detailView;
  }
  #disconnectBtn!: HTMLButtonElement;
  get disconnectBtn(): HTMLButtonElement {
    if (!this.#disconnectBtn) {
      throw new Error(`[justweb] 'disconnectBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#disconnectBtn;
  }
  #generateBtn!: HTMLButtonElement;
  get generateBtn(): HTMLButtonElement {
    if (!this.#generateBtn) {
      throw new Error(`[justweb] 'generateBtn' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#generateBtn;
  }
  #generateDisclosure!: HTMLParagraphElement;
  get generateDisclosure(): HTMLParagraphElement {
    if (!this.#generateDisclosure) {
      throw new Error(`[justweb] 'generateDisclosure' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#generateDisclosure;
  }
  #generateSection!: HTMLDivElement;
  get generateSection(): HTMLDivElement {
    if (!this.#generateSection) {
      throw new Error(`[justweb] 'generateSection' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#generateSection;
  }
  #generateStatus!: HTMLParagraphElement;
  get generateStatus(): HTMLParagraphElement {
    if (!this.#generateStatus) {
      throw new Error(`[justweb] 'generateStatus' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#generateStatus;
  }
  #generatedImage!: HTMLImageElement;
  get generatedImage(): HTMLImageElement {
    if (!this.#generatedImage) {
      throw new Error(`[justweb] 'generatedImage' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#generatedImage;
  }
  #gridView!: HTMLDivElement;
  get gridView(): HTMLDivElement {
    if (!this.#gridView) {
      throw new Error(`[justweb] 'gridView' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#gridView;
  }
  #headerBadge!: HTMLElement;
  get headerBadge(): HTMLElement {
    if (!this.#headerBadge) {
      throw new Error(`[justweb] 'headerBadge' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#headerBadge;
  }
  #headerName!: HTMLSpanElement;
  get headerName(): HTMLSpanElement {
    if (!this.#headerName) {
      throw new Error(`[justweb] 'headerName' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#headerName;
  }
  #prompt!: HTMLElement;
  get prompt(): HTMLElement {
    if (!this.#prompt) {
      throw new Error(`[justweb] 'prompt' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#prompt;
  }

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;
  // ── DDAS integrity observer (ADR-0012) ──────────────
  private _ddasIntegrityObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.#root = this as unknown as HTMLElement;
    this.classList.add('cartoon');

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
    if (!this.#backBtn) {
      const __el = this.querySelector('[data-part="back-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#backBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:back-btn');
      }
    }
    if (!this.#connectBtn) {
      const __el = this.querySelector('[data-part="connect-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#connectBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:connect-btn');
      }
    }
    if (!this.#connectDisclosure) {
      const __el = this.querySelector('[data-part="connect-disclosure"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#connectDisclosure = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:connect-disclosure');
      }
    }
    if (!this.#connectStatus) {
      const __el = this.querySelector('[data-part="connect-status"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#connectStatus = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:connect-status');
      }
    }
    if (!this.#connectToken) {
      const __el = this.querySelector('[data-part="connect-token"]') as HTMLInputElement | null;
      if (__el) {
        this.#connectToken = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:connect-token');
      }
    }
    if (!this.#detailView) {
      const __el = this.querySelector('[data-part="detail-view"]') as HTMLDivElement | null;
      if (__el) {
        this.#detailView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:detail-view');
      }
    }
    if (!this.#disconnectBtn) {
      const __el = this.querySelector('[data-part="disconnect-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#disconnectBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:disconnect-btn');
      }
    }
    if (!this.#generateBtn) {
      const __el = this.querySelector('[data-part="generate-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.#generateBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generate-btn');
      }
    }
    if (!this.#generateDisclosure) {
      const __el = this.querySelector('[data-part="generate-disclosure"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#generateDisclosure = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generate-disclosure');
      }
    }
    if (!this.#generateSection) {
      const __el = this.querySelector('[data-part="generate-section"]') as HTMLDivElement | null;
      if (__el) {
        this.#generateSection = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generate-section');
      }
    }
    if (!this.#generateStatus) {
      const __el = this.querySelector('[data-part="generate-status"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#generateStatus = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generate-status');
      }
    }
    if (!this.#generatedImage) {
      const __el = this.querySelector('[data-part="generated-image"]') as HTMLImageElement | null;
      if (__el) {
        this.#generatedImage = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generated-image');
      }
    }
    if (!this.#gridView) {
      const __el = this.querySelector('[data-part="grid-view"]') as HTMLDivElement | null;
      if (__el) {
        this.#gridView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:grid-view');
      }
    }
    if (!this.#headerBadge) {
      const __el = this.querySelector('[data-part="header-badge"]') as HTMLElement | null;
      if (__el) {
        this.#headerBadge = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:header-badge');
      }
    }
    if (!this.#headerName) {
      const __el = this.querySelector('[data-part="header-name"]') as HTMLSpanElement | null;
      if (__el) {
        this.#headerName = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:header-name');
      }
    }
    if (!this.#prompt) {
      const __el = this.querySelector('[data-part="prompt"]') as HTMLElement | null;
      if (__el) {
        this.#prompt = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:prompt');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.#backBtn && !!this.#connectBtn && !!this.#connectDisclosure && !!this.#connectStatus && !!this.#connectToken && !!this.#detailView && !!this.#disconnectBtn && !!this.#generateBtn && !!this.#generateDisclosure && !!this.#generateSection && !!this.#generateStatus && !!this.#generatedImage && !!this.#gridView && !!this.#headerBadge && !!this.#headerName && !!this.#prompt;
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
  const __existing = customElements.get('js-cartoon');
  if (!__existing) {
    customElements.define('js-cartoon', CartoonBase);
  } else if (__existing !== CartoonBase) {
    const __msg = "[justweb] custom element 'js-cartoon' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
