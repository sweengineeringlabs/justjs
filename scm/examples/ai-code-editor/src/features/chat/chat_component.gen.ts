// AUTO-GENERATED — do not edit. Regenerate with: jsc dom chat_component.yaml
// Source: chat_component.yaml (version 1)

export class ChatBase extends HTMLElement {
  static readonly tagName = 'js-chat';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references (private; read-only externally, ADR-0012) ──────────────────────────────────
  #root!: HTMLElement;
  get root(): HTMLElement { return this.#root; }
  #contextLabel!: HTMLParagraphElement;
  get contextLabel(): HTMLParagraphElement {
    if (!this.#contextLabel) {
      throw new Error(`[justweb] 'contextLabel' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#contextLabel;
  }
  #imageError!: HTMLParagraphElement;
  get imageError(): HTMLParagraphElement {
    if (!this.#imageError) {
      throw new Error(`[justweb] 'imageError' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#imageError;
  }
  #imageInput!: HTMLInputElement;
  get imageInput(): HTMLInputElement {
    if (!this.#imageInput) {
      throw new Error(`[justweb] 'imageInput' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#imageInput;
  }
  #imagePreview!: HTMLDivElement;
  get imagePreview(): HTMLDivElement {
    if (!this.#imagePreview) {
      throw new Error(`[justweb] 'imagePreview' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#imagePreview;
  }
  #imageThumb!: HTMLImageElement;
  get imageThumb(): HTMLImageElement {
    if (!this.#imageThumb) {
      throw new Error(`[justweb] 'imageThumb' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#imageThumb;
  }
  #messageInput!: HTMLInputElement;
  get messageInput(): HTMLInputElement {
    if (!this.#messageInput) {
      throw new Error(`[justweb] 'messageInput' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#messageInput;
  }
  #messages!: HTMLDivElement;
  get messages(): HTMLDivElement {
    if (!this.#messages) {
      throw new Error(`[justweb] 'messages' accessed before _bindElements() found it - check your markup has the matching [data-part] hook, or that this ran after connectedCallback`);
    }
    return this.#messages;
  }

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;
  // ── DDAS integrity observer (ADR-0012) ──────────────
  private _ddasIntegrityObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.#root = this as unknown as HTMLElement;
    this.classList.add('chat');

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
    if (!this.#contextLabel) {
      const __el = this.querySelector('[data-part="context-label"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#contextLabel = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:context-label');
      }
    }
    if (!this.#imageError) {
      const __el = this.querySelector('[data-part="image-error"]') as HTMLParagraphElement | null;
      if (__el) {
        this.#imageError = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:image-error');
      }
    }
    if (!this.#imageInput) {
      const __el = this.querySelector('[data-part="image-input"]') as HTMLInputElement | null;
      if (__el) {
        this.#imageInput = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:image-input');
      }
    }
    if (!this.#imagePreview) {
      const __el = this.querySelector('[data-part="image-preview"]') as HTMLDivElement | null;
      if (__el) {
        this.#imagePreview = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:image-preview');
      }
    }
    if (!this.#imageThumb) {
      const __el = this.querySelector('[data-part="image-thumb"]') as HTMLImageElement | null;
      if (__el) {
        this.#imageThumb = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:image-thumb');
      }
    }
    if (!this.#messageInput) {
      const __el = this.querySelector('[data-part="message-input"]') as HTMLInputElement | null;
      if (__el) {
        this.#messageInput = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:message-input');
      }
    }
    if (!this.#messages) {
      const __el = this.querySelector('[data-part="messages"]') as HTMLDivElement | null;
      if (__el) {
        this.#messages = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:messages');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.#contextLabel && !!this.#imageError && !!this.#imageInput && !!this.#imagePreview && !!this.#imageThumb && !!this.#messageInput && !!this.#messages;
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
  const __existing = customElements.get('js-chat');
  if (!__existing) {
    customElements.define('js-chat', ChatBase);
  } else if (__existing !== ChatBase) {
    const __msg = "[justweb] custom element 'js-chat' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
