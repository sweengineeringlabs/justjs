// Captured verbatim from a real justweb-generated project - NOT hand-authored.
// Provenance: `justw init test-app --features home` + `justw generate app`
// (justweb main @ 840fab8/35e8df5, after justweb#52/#56 landed), with a
// `props: { greeting: { type: string, default: "Home" } }` added to
// home_component.yaml to exercise the props:-signal codegen path. Captured
// 2026-07-07 for justjs#39's real-DOM integration test. Do not hand-edit -
// if this drifts from real justweb output, regenerate and recapture instead.

import { signal, effect } from '@preact/signals-core';

export class HomeBase extends HTMLElement {
  static readonly tagName = 'js-home';
  static get observedAttributes(): string[] { return ['greeting']; }

  // ── Reactive state ─────────────────────────────────────────
  readonly checked = signal(false);
  readonly completed = signal(false);
  readonly disabled = signal(false);
  readonly expanded = signal(false);
  readonly invalid = signal(false);
  readonly loading = signal(false);
  readonly selected = signal(false);

  // ── Reactive props ──────────────────────────────────────────
  readonly greeting = signal<string>("Home");

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLDivElement;
  protected button!: HTMLButtonElement;
  protected input!: HTMLInputElement;
  protected label!: HTMLSpanElement;
  protected link!: HTMLAnchorElement;

  // ── Slot references ─────────────────────────────────────
  protected headerSlot!: HTMLDivElement;
  protected footerSlot: HTMLDivElement | null = null;

  // ── Deferred-bind observer ──────────────────────────
  private _lightDomObserver: MutationObserver | null = null;

  connectedCallback(): void {
    // Element setup
    this.root = this as unknown as HTMLDivElement;
    this.classList.add('home');

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

    // Static ARIA
    this.setAttribute('role', 'region');
    this.setAttribute('aria-label', 'Home');

    // Signal effects
    this.#cleanups.push(effect(() => {
      const val = this.checked.value;
      if (val) {
        this.setAttribute('aria-checked', 'true');
      } else {
        this.removeAttribute('aria-checked');
      }
    }));
    this.#cleanups.push(effect(() => {
      const val = this.completed.value;
      if (val) {
        this.setAttribute('data-completed', '');
      } else {
        this.removeAttribute('data-completed');
      }
    }));
    this.#cleanups.push(effect(() => {
      const val = this.disabled.value;
      if (val) {
        this.setAttribute('aria-disabled', 'true');
      } else {
        this.removeAttribute('aria-disabled');
      }
    }));
    this.#cleanups.push(effect(() => {
      const val = this.expanded.value;
      if (val) {
        this.setAttribute('aria-expanded', 'true');
      } else {
        this.removeAttribute('aria-expanded');
      }
    }));
    this.#cleanups.push(effect(() => {
      const val = this.invalid.value;
      if (val) {
        this.setAttribute('aria-invalid', 'true');
      } else {
        this.removeAttribute('aria-invalid');
      }
      if (val) {
        this.setAttribute('data-invalid', '');
      } else {
        this.removeAttribute('data-invalid');
      }
    }));
    this.#cleanups.push(effect(() => {
      const val = this.loading.value;
      if (val) {
        this.setAttribute('aria-busy', 'true');
      } else {
        this.removeAttribute('aria-busy');
      }
    }));
    this.#cleanups.push(effect(() => {
      const val = this.selected.value;
      if (val) {
        this.setAttribute('aria-selected', 'true');
      } else {
        this.removeAttribute('aria-selected');
      }
    }));

    // Event wiring
    this.addEventListener('custom', (e) => {
      this.dispatchEvent(new CustomEvent('increment', { detail: e, bubbles: true, cancelable: false }));
    });
    this.addEventListener('submit', (e) => {
      this.dispatchEvent(new CustomEvent('submit', { detail: e, bubbles: true, cancelable: true }));
    });
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null): void {
    switch (name) {
      case 'greeting':
        this.greeting.value = newValue ?? "Home";
        break;
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
    if (!this.button) {
      const __el = this.querySelector('[data-part="button"]') as HTMLButtonElement | null;
      if (__el) {
        this.button = __el;
        __el.setAttribute('data-ddas-id', 'test-app:home:home:button');
      }
    }
    if (!this.input) {
      const __el = this.querySelector('[data-part="input"]') as HTMLInputElement | null;
      if (__el) {
        this.input = __el;
        __el.setAttribute('data-ddas-id', 'test-app:home:home:input');
      }
    }
    if (!this.label) {
      const __el = this.querySelector('[data-part="label"]') as HTMLSpanElement | null;
      if (__el) {
        this.label = __el;
        __el.setAttribute('data-ddas-id', 'test-app:home:home:label');
      }
    }
    if (!this.link) {
      const __el = this.querySelector('[data-part="link"]') as HTMLAnchorElement | null;
      if (__el) {
        this.link = __el;
        __el.setAttribute('data-ddas-id', 'test-app:home:home:link');
      }
    }
    if (!this.headerSlot) {
      const __slot = this.querySelector('[slot="header"]') as HTMLDivElement | null;
      if (__slot) this.headerSlot = __slot;
    }
    if (!this.footerSlot) {
      this.footerSlot = this.querySelector('[slot="footer"]') as HTMLDivElement | null;
    }
  }

  private _hasAllElements(): boolean {
    return !!this.button && !!this.input && !!this.label && !!this.link && !!this.headerSlot;
  }
}

if (typeof customElements === 'object' && customElements !== null && typeof customElements.define === 'function') {
  const __existing = customElements.get('js-home');
  if (!__existing) {
    customElements.define('js-home', HomeBase);
  } else if (__existing !== HomeBase) {
    const __msg = "[justweb] custom element 'js-home' is already registered to a different class";
    const __strict: boolean = (globalThis as { __justwebRegistryStrict__?: boolean }).__justwebRegistryStrict__ === true;
    if (__strict) { throw new Error(__msg); }
    console.warn(__msg + '; keeping the existing registration');
  }
}
