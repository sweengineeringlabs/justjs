import "@justjs/component-view";
import type { NavHeaderView } from "@justjs/component-view";
import type { CliCommandResult } from "../core/cli.js";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

interface CliHistoryEntry {
  readonly input: string;
  readonly cwd: string;
  readonly output: string;
  readonly isError?: boolean;
}

// Runs one already-parsed command line against the host's current
// virtual filesystem state and returns the result - the control never
// touches a store itself (matches ADR-0007's "caller supplies the
// actual call" split every *-connect control already uses), the host
// (workspace.ts) closes over `this.store.state.value` on each call so
// the control always sees fresh files/emptyFolders without needing its
// own subscription.
export type CliRunFunction = (input: string, cwd: string) => CliCommandResult;

// Real Shadow DOM extraction of x-workspace's Development-stage CLI
// terminal (justjs#122, part of justjs#119's decomposition) - a
// terminal against this app's own virtual filesystem (core/cli.ts),
// not an AI-backed interpreter, not a real OS shell. Follows
// ProviderConnectorControl's established shape (plain HTMLElement,
// shadow DOM, own render, props-in/events-out) rather than justweb's
// dom.elements/generated-base-class pattern - confirmed no nested
// control-*/view-* element in this codebase goes through justweb
// codegen (zero *.yaml/*.gen.ts in component-view/provider-connect).
//
// Unlike the original (which fully rebuilds the entire template via
// container.innerHTML on every Enter/Run), this control builds its
// shell once in connectedCallback and appends transcript entries
// in place - a real behavioral improvement enabled by owning a stable
// Shadow DOM subtree, not just a relocation of the same code.
export class CliTerminalControl extends HTMLElement {
  #cwd = "";
  #history: CliHistoryEntry[] = [];
  #run: CliRunFunction | undefined;
  readonly #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  set run(fn: CliRunFunction | undefined) {
    this.#run = fn;
  }

  connectedCallback(): void {
    this.#renderShell();
  }

  #prompt(cwd: string): string {
    return `${cwd ? `/${cwd}` : "/"}$`;
  }

  #renderShell(): void {
    this.#root.innerHTML = `
      <style>
        :host { display: block; }
        .cli-transcript {
          min-height: 220px;
          max-height: 420px;
          overflow-y: auto;
          padding: 12px 14px;
          margin-bottom: 10px;
          background: var(--surface);
          border-radius: var(--radius-md);
          box-shadow: var(--shadow);
          font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .cli-entry { margin-bottom: 8px; }
        .cli-entry-prompt { color: var(--accent-strong); font-weight: 600; }
        .cli-entry-output {
          margin: 2px 0 0;
          padding: 0;
          color: var(--text);
          white-space: pre-wrap;
          word-break: break-word;
          font: inherit;
          background: none;
        }
        .cli-entry-output.cli-entry-error { color: var(--danger); }
        .cli-input-row { display: flex; align-items: center; gap: 8px; }
        .cli-prompt {
          flex: 0 0 auto;
          color: var(--accent-strong);
          font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-weight: 600;
        }
        input {
          flex: 1;
          min-width: 0;
          box-sizing: border-box;
          padding: 10px 12px;
          margin: 0;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--surface);
          color: var(--text);
          font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        button {
          flex: 0 0 auto;
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
      <view-nav-header id="header" icon="💻" title="CLI"></view-nav-header>
      <div id="transcript" class="cli-transcript"></div>
      <div class="cli-input-row">
        <span id="prompt" class="cli-prompt"></span>
        <input id="input" type="text" autocomplete="off" spellcheck="false" placeholder="help" />
        <button id="run-btn" type="button">Run</button>
      </div>
    `;

    const header = this.#root.querySelector<NavHeaderView>("#header")!;
    header.backLabel = "Development";
    header.addEventListener("nav-back", () => {
      this.dispatchEvent(new CustomEvent("back", { bubbles: true, composed: true }));
    });

    const input = this.#root.querySelector<HTMLInputElement>("#input")!;
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.#handleRun();
      }
    });
    this.#root.querySelector("#run-btn")?.addEventListener("click", () => this.#handleRun());

    this.#renderHistory();
    this.#updatePrompt();
    input.focus();
  }

  #updatePrompt(): void {
    const promptEl = this.#root.querySelector("#prompt");
    if (promptEl) {
      promptEl.textContent = this.#prompt(this.#cwd);
    }
  }

  #renderHistory(): void {
    const transcript = this.#root.querySelector<HTMLElement>("#transcript");
    if (!transcript) {
      return;
    }
    transcript.innerHTML = this.#history
      .map(
        (entry) => `
          <div class="cli-entry">
            <div class="cli-entry-prompt">${escapeHtml(this.#prompt(entry.cwd))} ${escapeHtml(entry.input)}</div>
            ${entry.output ? `<pre class="cli-entry-output${entry.isError ? " cli-entry-error" : ""}">${escapeHtml(entry.output)}</pre>` : ""}
          </div>
        `
      )
      .join("");
    transcript.scrollTop = transcript.scrollHeight;
  }

  #handleRun(): void {
    const input = this.#root.querySelector<HTMLInputElement>("#input");
    if (!input) {
      return;
    }
    const trimmed = input.value.trim();
    if (!trimmed) {
      return;
    }
    input.value = "";
    // A client-side terminal built-in, not a real filesystem command -
    // matches how real terminal emulators handle `clear` (wipes the
    // screen, leaves no trace in the transcript); core/cli.ts is never
    // consulted for it, same as the original.
    if (trimmed === "clear") {
      this.#history = [];
      this.#renderHistory();
      input.focus();
      return;
    }
    const result = this.#run?.(trimmed, this.#cwd);
    if (!result) {
      return;
    }
    this.#history = [
      ...this.#history,
      { input: trimmed, cwd: this.#cwd, output: result.output, ...(result.isError !== undefined ? { isError: result.isError } : {}) },
    ];
    this.#cwd = result.cwd;
    this.#renderHistory();
    this.#updatePrompt();
    input.focus();
    if (result.action) {
      this.dispatchEvent(new CustomEvent("command", { detail: { action: result.action }, bubbles: true, composed: true }));
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("control-cli-terminal")) {
  customElements.define("control-cli-terminal", CliTerminalControl);
}
