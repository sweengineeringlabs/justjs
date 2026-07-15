import { escapeAttr } from "./escape.js";
import type { FormField } from "../api/form_view.js";

// Real Shadow DOM port of the credential-entry step duplicated across
// all 6 provider-connect screens (ADR-0015) - a bearer token (1 field)
// or one of 4 real 2-field shapes (Bluesky identifier+app-password,
// Reddit/Jira client-ID+secret, AWS access-key+secret-key, Trello
// API-key+token), always wrapped in the same connect-form/
// connect-actions markup with Connect/Disconnect buttons. Doesn't own
// whether it's "connecting" or what the result was - that's
// <control-provider-connector>'s job (ADR-0007), passed in as props,
// same "props in, event out" shape as <view-toggle>/<view-grid>. No
// standalone migration target - only proves itself real once composed
// there.
//
// The Connect button's label never changes to "Connecting..." -
// checked handleConnect() directly in cartoon.ts/workspace.ts/etc:
// only `disabled` toggles during a connect call, the "Connecting..."
// text lives in the separate status line below this form (out of
// scope here, ADR-0009's own explicit exclusion).
export class FormView extends HTMLElement {
  #fields: readonly FormField[] = [];
  #connecting = false;
  #connected = false;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  get fields(): readonly FormField[] {
    return this.#fields;
  }
  set fields(value: readonly FormField[]) {
    this.#fields = value;
    this.render();
  }

  get connecting(): boolean {
    return this.#connecting;
  }
  set connecting(value: boolean) {
    this.#connecting = value;
    this.render();
  }

  get connected(): boolean {
    return this.#connected;
  }
  set connected(value: boolean) {
    this.#connected = value;
    this.render();
  }

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .connect-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px;
          background: linear-gradient(135deg, color-mix(in srgb, var(--stage-color, var(--accent)) 10%, var(--surface)) 0%, var(--surface) 70%);
          border: 1px solid color-mix(in srgb, var(--stage-color, var(--accent)) 20%, var(--border));
          border-radius: var(--radius-md);
        }
        input {
          box-sizing: border-box;
          width: 100%;
          padding: 10px 12px;
          margin: 0;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--surface);
          color: var(--text);
          font-size: 14px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .connect-actions {
          display: flex;
          gap: 10px;
        }
        button {
          flex: 1;
          border: none;
          padding: 10px 18px;
          font-size: 14px;
          font-family: inherit;
          font-weight: 600;
          border-radius: var(--radius-pill);
          background: var(--accent);
          color: var(--accent-text);
          cursor: pointer;
          transition: opacity 0.15s ease, transform 0.05s ease;
        }
        button.disconnect-btn {
          background: var(--surface-alt);
          color: var(--text);
        }
        button:active { transform: scale(0.97); opacity: 0.85; }
        button:disabled { opacity: 0.5; cursor: default; }
        @media (hover: hover) and (pointer: fine) {
          button:hover:not(:disabled) { opacity: 0.9; }
        }
        button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
      </style>
      <div class="connect-form">
        ${this.#fields
          .map(
            (field) =>
              `<input data-field-id="${escapeAttr(field.id)}" type="${escapeAttr(field.type)}" placeholder="${escapeAttr(field.placeholder)}" autocomplete="off" spellcheck="false" />`
          )
          .join("")}
        <div class="connect-actions">
          <button type="button" class="connect-btn"${this.#connecting ? " disabled" : ""}>${this.#connected ? "Reconnect" : "Connect"}</button>
          ${this.#connected ? `<button type="button" class="disconnect-btn">Disconnect</button>` : ""}
        </div>
      </div>
    `;
    this.#root.querySelector(".connect-btn")?.addEventListener("click", () => {
      const values: Record<string, string> = {};
      this.#root.querySelectorAll<HTMLInputElement>("input[data-field-id]").forEach((input) => {
        values[input.dataset.fieldId ?? ""] = input.value;
      });
      this.dispatchEvent(new CustomEvent("submit", { detail: { values }, bubbles: true, composed: true }));
    });
    this.#root.querySelector(".disconnect-btn")?.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("disconnect", { bubbles: true, composed: true }));
    });
  }
}

if (typeof customElements !== "undefined" && !customElements.get("view-form")) {
  customElements.define("view-form", FormView);
}
