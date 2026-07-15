// AUTO-GENERATED — do not edit. Regenerate with: jsc dom socials_component.yaml
// Source: socials_component.yaml (version 1)

export class SocialsBase extends HTMLElement {
  static readonly tagName = 'js-socials';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLElement;
  protected connector!: HTMLElement;
  protected pageHeader!: HTMLElement;

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.root = this as unknown as HTMLElement;
    this.classList.add('socials');

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
        __el.setAttribute('data-ddas-id', 'ai-code-editor:socials:socials:connector');
      }
    }
    if (!this.pageHeader) {
      const __el = this.querySelector('[data-part="page-header"]') as HTMLElement | null;
      if (__el) {
        this.pageHeader = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:socials:socials:page-header');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.connector && !!this.pageHeader;
  }
}

if (typeof customElements === 'object' && customElements !== null && typeof customElements.define === 'function') {
  const __existing = customElements.get('js-socials');
  if (!__existing) {
    customElements.define('js-socials', SocialsBase);
  } else if (__existing !== SocialsBase) {
    const __msg = "[justweb] custom element 'js-socials' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
