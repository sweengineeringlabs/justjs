// AUTO-GENERATED — do not edit. Regenerate with: jsc dom cartoon_component.yaml
// Source: cartoon_component.yaml (version 1)

export class CartoonBase extends HTMLElement {
  static readonly tagName = 'js-cartoon';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLElement;
  protected backBtn!: HTMLButtonElement;
  protected connectBtn!: HTMLButtonElement;
  protected connectDisclosure!: HTMLParagraphElement;
  protected connectStatus!: HTMLParagraphElement;
  protected connectToken!: HTMLInputElement;
  protected detailView!: HTMLDivElement;
  protected disconnectBtn!: HTMLButtonElement;
  protected generateBtn!: HTMLButtonElement;
  protected generateDisclosure!: HTMLParagraphElement;
  protected generateSection!: HTMLDivElement;
  protected generateStatus!: HTMLParagraphElement;
  protected generatedImage!: HTMLImageElement;
  protected gridView!: HTMLDivElement;
  protected headerBadge!: HTMLElement;
  protected headerName!: HTMLSpanElement;
  protected prompt!: HTMLElement;

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.root = this as unknown as HTMLElement;
    this.classList.add('cartoon');

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
    if (!this.backBtn) {
      const __el = this.querySelector('[data-part="back-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.backBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:back-btn');
      }
    }
    if (!this.connectBtn) {
      const __el = this.querySelector('[data-part="connect-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.connectBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:connect-btn');
      }
    }
    if (!this.connectDisclosure) {
      const __el = this.querySelector('[data-part="connect-disclosure"]') as HTMLParagraphElement | null;
      if (__el) {
        this.connectDisclosure = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:connect-disclosure');
      }
    }
    if (!this.connectStatus) {
      const __el = this.querySelector('[data-part="connect-status"]') as HTMLParagraphElement | null;
      if (__el) {
        this.connectStatus = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:connect-status');
      }
    }
    if (!this.connectToken) {
      const __el = this.querySelector('[data-part="connect-token"]') as HTMLInputElement | null;
      if (__el) {
        this.connectToken = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:connect-token');
      }
    }
    if (!this.detailView) {
      const __el = this.querySelector('[data-part="detail-view"]') as HTMLDivElement | null;
      if (__el) {
        this.detailView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:detail-view');
      }
    }
    if (!this.disconnectBtn) {
      const __el = this.querySelector('[data-part="disconnect-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.disconnectBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:disconnect-btn');
      }
    }
    if (!this.generateBtn) {
      const __el = this.querySelector('[data-part="generate-btn"]') as HTMLButtonElement | null;
      if (__el) {
        this.generateBtn = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generate-btn');
      }
    }
    if (!this.generateDisclosure) {
      const __el = this.querySelector('[data-part="generate-disclosure"]') as HTMLParagraphElement | null;
      if (__el) {
        this.generateDisclosure = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generate-disclosure');
      }
    }
    if (!this.generateSection) {
      const __el = this.querySelector('[data-part="generate-section"]') as HTMLDivElement | null;
      if (__el) {
        this.generateSection = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generate-section');
      }
    }
    if (!this.generateStatus) {
      const __el = this.querySelector('[data-part="generate-status"]') as HTMLParagraphElement | null;
      if (__el) {
        this.generateStatus = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generate-status');
      }
    }
    if (!this.generatedImage) {
      const __el = this.querySelector('[data-part="generated-image"]') as HTMLImageElement | null;
      if (__el) {
        this.generatedImage = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:generated-image');
      }
    }
    if (!this.gridView) {
      const __el = this.querySelector('[data-part="grid-view"]') as HTMLDivElement | null;
      if (__el) {
        this.gridView = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:grid-view');
      }
    }
    if (!this.headerBadge) {
      const __el = this.querySelector('[data-part="header-badge"]') as HTMLElement | null;
      if (__el) {
        this.headerBadge = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:header-badge');
      }
    }
    if (!this.headerName) {
      const __el = this.querySelector('[data-part="header-name"]') as HTMLSpanElement | null;
      if (__el) {
        this.headerName = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:header-name');
      }
    }
    if (!this.prompt) {
      const __el = this.querySelector('[data-part="prompt"]') as HTMLElement | null;
      if (__el) {
        this.prompt = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:cartoon:cartoon:prompt');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.backBtn && !!this.connectBtn && !!this.connectDisclosure && !!this.connectStatus && !!this.connectToken && !!this.detailView && !!this.disconnectBtn && !!this.generateBtn && !!this.generateDisclosure && !!this.generateSection && !!this.generateStatus && !!this.generatedImage && !!this.gridView && !!this.headerBadge && !!this.headerName && !!this.prompt;
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
