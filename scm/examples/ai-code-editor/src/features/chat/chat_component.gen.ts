// AUTO-GENERATED — do not edit. Regenerate with: jsc dom chat_component.yaml
// Source: chat_component.yaml (version 1)

export class ChatBase extends HTMLElement {
  static readonly tagName = 'js-chat';

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLElement;
  protected contextLabel!: HTMLParagraphElement;
  protected imageError!: HTMLParagraphElement;
  protected imageInput!: HTMLInputElement;
  protected imagePreview!: HTMLDivElement;
  protected imageThumb!: HTMLImageElement;
  protected messageInput!: HTMLInputElement;
  protected messages!: HTMLDivElement;

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.root = this as unknown as HTMLElement;
    this.classList.add('chat');

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
    if (!this.contextLabel) {
      const __el = this.querySelector('[data-part="context-label"]') as HTMLParagraphElement | null;
      if (__el) {
        this.contextLabel = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:context-label');
      }
    }
    if (!this.imageError) {
      const __el = this.querySelector('[data-part="image-error"]') as HTMLParagraphElement | null;
      if (__el) {
        this.imageError = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:image-error');
      }
    }
    if (!this.imageInput) {
      const __el = this.querySelector('[data-part="image-input"]') as HTMLInputElement | null;
      if (__el) {
        this.imageInput = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:image-input');
      }
    }
    if (!this.imagePreview) {
      const __el = this.querySelector('[data-part="image-preview"]') as HTMLDivElement | null;
      if (__el) {
        this.imagePreview = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:image-preview');
      }
    }
    if (!this.imageThumb) {
      const __el = this.querySelector('[data-part="image-thumb"]') as HTMLImageElement | null;
      if (__el) {
        this.imageThumb = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:image-thumb');
      }
    }
    if (!this.messageInput) {
      const __el = this.querySelector('[data-part="message-input"]') as HTMLInputElement | null;
      if (__el) {
        this.messageInput = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:message-input');
      }
    }
    if (!this.messages) {
      const __el = this.querySelector('[data-part="messages"]') as HTMLDivElement | null;
      if (__el) {
        this.messages = __el;
        __el.setAttribute('data-ddas-id', 'ai-code-editor:chat:chat:messages');
      }
    }
  }

  private _hasAllElements(): boolean {
    return !!this.contextLabel && !!this.imageError && !!this.imageInput && !!this.imagePreview && !!this.imageThumb && !!this.messageInput && !!this.messages;
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
