// AUTO-GENERATED — do not edit. Regenerate with: jsc dom socials_component.yaml
// Source: socials_component.yaml (version 1)

import { signal, effect } from '@preact/signals-core';

export class SocialsBase extends HTMLElement {
  static readonly tagName = 'js-socials';

  // ── Reactive state ─────────────────────────────────────────
  readonly checked = signal(false);
  readonly completed = signal(false);
  readonly disabled = signal(false);
  readonly expanded = signal(false);
  readonly invalid = signal(false);
  readonly loading = signal(false);
  readonly selected = signal(false);

  // ── Effect cleanup handles ──────────────────────────────────────────────
  #cleanups: Array<() => void> = [];

  // ── Element references ──────────────────────────────────
  protected root!: HTMLElement;

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
        this.setAttribute('disabled', '');
        this.setAttribute('aria-disabled', 'true');
      } else {
        this.removeAttribute('disabled');
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
  }

  private _hasAllElements(): boolean {
    return true;
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
