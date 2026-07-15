// Google Gemini is the only one of the 3 real providers with a real,
// official brand mark in simple-icons' catalog - OpenAI and Stability
// AI aren't (same real gap AWS/Azure/Heroku hit in workspace.ts's
// CLOUD_PROVIDER_CATALOG) - both fall back to a plain colored monogram
// instead of a fabricated logo shape.
import geminiLogo from "simple-icons/icons/googlegemini.svg?raw";
import { getStoredCartoonToken, setStoredCartoonToken } from "../core/cartoon_credentials.js";
import {
  connectOpenAi,
  connectStability,
  connectGemini,
  generateOpenAiCartoon,
  generateStabilityCartoon,
  generateGeminiCartoon,
  buildImageDataUrl,
} from "../core/cartoon_connect.js";
import type { GeneratedImage } from "../core/cartoon_connect.js";
import "@justjs/component-view";
import type { BadgeView, PromptFieldView } from "@justjs/component-view";

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

interface CartoonProvider {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly logo?: string;
  // Real, provider-specific: exactly how cartoon styling is actually
  // achieved (Stability's real, literal style_preset field vs. OpenAI's/
  // Gemini's real prompt-engineering prefix) plus a real approximate
  // per-generation cost - shown before the user ever clicks Generate,
  // since every call here is genuinely billed, unlike every other
  // real connection in this app.
  readonly disclosure: string;
}

// A real, recognizable set of actual image-generation providers - not
// a free-text "type any name" list. All 3 use a single pasted API key,
// same security posture as the Anthropic key - but unlike every other
// provider in this app, a "Generate" click here is a real, billed API
// call, not a free connect-and-list.
const CARTOON_PROVIDER_CATALOG: readonly CartoonProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "🧠",
    color: "#412991",
    disclosure:
      'Cartoon styling is real prompt engineering (this app prefixes your prompt with "A cartoon-style illustration of:") - OpenAI has no structured style parameter. Uses the current gpt-image-1.5 model (dall-e-3 was retired from the API). Real cost: ~$0.04/image.',
  },
  {
    id: "stability",
    name: "Stability AI",
    icon: "🎨",
    color: "#000000",
    disclosure:
      'Cartoon styling uses Stability\'s own real style_preset field ("comic-book") - a real, structured API parameter, not just prompt wording. Real cost: ~$0.03/image.',
  },
  {
    id: "gemini",
    name: "Google Gemini",
    icon: "✨",
    color: "#8E75B2",
    logo: geminiLogo,
    disclosure:
      "Cartoon styling is real prompt engineering (same approach as OpenAI) - Gemini has no structured style parameter either. Uses the pinned-stable gemini-2.5-flash-image model. Real cost: ~$0.04/image.",
  },
];

const CARTOON_CONNECTORS: Record<string, (token: string) => Promise<string>> = {
  openai: connectOpenAi,
  stability: connectStability,
  gemini: connectGemini,
};

const CARTOON_GENERATORS: Record<string, (token: string, prompt: string) => Promise<GeneratedImage>> = {
  openai: generateOpenAiCartoon,
  stability: generateStabilityCartoon,
  gemini: generateGeminiCartoon,
};

function setBadgeProps(el: Element | null, p: { readonly icon?: string; readonly color: string; readonly logo?: string }): void {
  const badge = el as BadgeView | null;
  if (!badge) {
    return;
  }
  badge.color = p.color;
  if (p.icon !== undefined) {
    badge.icon = p.icon;
  }
  if (p.logo !== undefined) {
    badge.logo = p.logo;
  }
}

// Cartoon Generator - the 8th top-level tab. Same standalone shape
// communication.ts/socials.ts already established (no SDLC wrapper).
// Architecturally different from every other provider tab in this
// app: the real capability is "generate" (@justjs/image-connect), not
// "connect and list resources" - connect() stays a real, free
// key-check (safe to auto-fire on revisit, same lazy-validation
// posture every other provider uses), but generate() is always a real,
// billed call, gated behind an explicit button click and a visible
// cost disclosure - never auto-triggered.
export class CartoonElement extends HTMLElement {
  private selectedProviderId: string | null = null;
  private connectStatus: string | null = null;
  private connectError: string | null = null;
  private connecting = false;

  private generatedImage: GeneratedImage | null = null;
  private generateError: string | null = null;
  private generating = false;

  connectedCallback(): void {
    this.renderView();
  }

  private renderView(): void {
    if (this.selectedProviderId) {
      const provider = CARTOON_PROVIDER_CATALOG.find((p) => p.id === this.selectedProviderId);
      if (provider) {
        this.renderDetail(provider);
        return;
      }
      this.selectedProviderId = null;
    }
    this.renderGrid();
  }

  private isProviderConnected(p: CartoonProvider): boolean {
    return getStoredCartoonToken(p.id).length > 0;
  }

  private renderGrid(): void {
    this.innerHTML = `
      <div class="dash-subnav">
        <h2 class="workspace-stage-title">🎨 Cartoon Generator</h2>
      </div>
      <p class="connect-hint">Tap a provider to connect a real account and generate a real cartoon image from a text prompt. API keys are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none). Every generation is a real, billed API call - each provider's own screen shows the real approximate cost before you generate.</p>
      <div class="provider-grid">
        ${CARTOON_PROVIDER_CATALOG.map((p) => {
          const connected = this.isProviderConnected(p);
          return `
            <button type="button" class="provider-card${connected ? " selected" : ""}" data-cartoon-provider-id="${p.id}">
              <view-badge data-badge-for="${p.id}"></view-badge>
              <span class="provider-name">${escapeHtml(p.name)}</span>
              <span class="provider-check">${connected ? "✓ Connected" : ""}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;

    this.querySelectorAll<HTMLButtonElement>("[data-cartoon-provider-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.cartoonProviderId;
        if (!id) {
          return;
        }
        this.selectedProviderId = id;
        this.connectStatus = null;
        this.connectError = null;
        this.generatedImage = null;
        this.generateError = null;
        this.renderView();
      });
    });
    this.querySelectorAll<Element>("view-badge[data-badge-for]").forEach((el) => {
      const provider = CARTOON_PROVIDER_CATALOG.find((p) => p.id === (el as HTMLElement).dataset.badgeFor);
      if (provider) {
        setBadgeProps(el, provider);
      }
    });
  }

  private renderDetail(provider: CartoonProvider): void {
    const connected = this.isProviderConnected(provider);
    this.innerHTML = `
      <div class="dash-subnav">
        <button id="cartoon-back-btn" class="dash-back-btn" type="button">← Cartoon Generator</button>
        <h2 class="workspace-stage-title"><view-badge id="cartoon-header-badge"></view-badge> ${escapeHtml(provider.name)}</h2>
      </div>
      <p class="settings-disclosure">Stored only on this device. Sent directly to ${escapeHtml(provider.name)} when you connect.</p>
      <div class="connect-form">
        <input id="cartoon-connect-token" type="password" placeholder="Paste your ${escapeHtml(provider.name)} API key" autocomplete="off" spellcheck="false" />
        <div class="connect-actions">
          <button id="cartoon-connect-btn" type="button">${connected ? "Reconnect" : "Connect"}</button>
          ${connected ? `<button id="cartoon-disconnect-btn" type="button" class="btn-secondary">Disconnect</button>` : ""}
        </div>
        <p id="cartoon-connect-status" class="connect-status${this.connectError ? " connect-status-error" : ""}">${this.connecting ? "Connecting…" : this.connectError ? `⚠️ ${escapeHtml(this.connectError)}` : this.connectStatus ? `✓ ${escapeHtml(this.connectStatus)}` : ""}</p>
      </div>
      ${this.renderGenerateSection(provider)}
    `;
    setBadgeProps(this.querySelector("#cartoon-header-badge"), provider);
    const promptField = this.querySelector<PromptFieldView>("#cartoon-prompt");
    if (promptField) {
      promptField.placeholder = "Describe what to draw, e.g. a fox riding a skateboard";
      promptField.rows = 3;
    }

    this.querySelector("#cartoon-back-btn")?.addEventListener("click", () => {
      this.selectedProviderId = null;
      this.renderView();
    });
    this.querySelector("#cartoon-connect-btn")?.addEventListener("click", () => {
      void this.handleConnect(provider);
    });
    this.querySelector("#cartoon-disconnect-btn")?.addEventListener("click", () => {
      setStoredCartoonToken(provider.id, "");
      this.connectStatus = null;
      this.connectError = null;
      this.generatedImage = null;
      this.generateError = null;
      this.renderView();
    });
    this.querySelector("#cartoon-generate-btn")?.addEventListener("click", () => {
      void this.handleGenerate(provider);
    });

    // connect() is a real, free key-check (never billed) - safe to
    // auto-fire on revisit, same lazy-validation posture every other
    // provider in this app uses. generate() never auto-fires - it's a
    // real, billed call, always gated behind an explicit click.
    if (connected && !this.connectStatus && !this.connectError && !this.connecting) {
      void this.handleConnect(provider);
    }
  }

  private renderGenerateSection(provider: CartoonProvider): string {
    const connected = this.isProviderConnected(provider);
    if (!connected) {
      return "";
    }
    const imageHtml = this.generatedImage
      ? `<img class="cartoon-generated-image" src="${escapeHtml(buildImageDataUrl(this.generatedImage))}" alt="Generated cartoon" />`
      : "";
    return `
      <p class="connect-hint">${escapeHtml(provider.disclosure)}</p>
      <div class="connect-form">
        <view-prompt-field id="cartoon-prompt"></view-prompt-field>
        <div class="connect-actions">
          <button id="cartoon-generate-btn" type="button">${this.generating ? "Generating…" : "Generate Cartoon"}</button>
        </div>
        <p id="cartoon-generate-status" class="connect-status${this.generateError ? " connect-status-error" : ""}">${this.generating ? "Generating - this is a real, billed API call…" : this.generateError ? `⚠️ ${escapeHtml(this.generateError)}` : ""}</p>
      </div>
      ${imageHtml}
    `;
  }

  private async handleConnect(provider: CartoonProvider): Promise<void> {
    const statusEl = this.querySelector<HTMLElement>("#cartoon-connect-status");
    const connectBtn = this.querySelector<HTMLButtonElement>("#cartoon-connect-btn");
    const tokenInput = this.querySelector<HTMLInputElement>("#cartoon-connect-token");
    const token = tokenInput?.value.trim() || getStoredCartoonToken(provider.id);
    if (!token) {
      this.connectError = "Paste an API key first.";
      this.renderView();
      return;
    }

    this.connecting = true;
    this.connectError = null;
    if (connectBtn) {
      connectBtn.disabled = true;
    }
    if (statusEl) {
      statusEl.textContent = "Connecting…";
    }
    try {
      const status = await CARTOON_CONNECTORS[provider.id]!(token);
      setStoredCartoonToken(provider.id, token);
      this.connectStatus = status;
      this.connectError = null;
    } catch (e) {
      this.connectError = e instanceof Error ? e.message : String(e);
      this.connectStatus = null;
    } finally {
      this.connecting = false;
      this.renderView();
    }
  }

  private async handleGenerate(provider: CartoonProvider): Promise<void> {
    const promptInput = this.querySelector<PromptFieldView>("#cartoon-prompt");
    const prompt = promptInput?.value.trim() ?? "";
    if (!prompt) {
      this.generateError = "Describe what to draw first.";
      this.renderView();
      return;
    }

    const token = getStoredCartoonToken(provider.id);
    this.generating = true;
    this.generateError = null;
    this.renderView();
    try {
      this.generatedImage = await CARTOON_GENERATORS[provider.id]!(token, prompt);
      this.generateError = null;
    } catch (e) {
      this.generateError = e instanceof Error ? e.message : String(e);
      this.generatedImage = null;
    } finally {
      this.generating = false;
      this.renderView();
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-cartoon")) {
  customElements.define("x-cartoon", CartoonElement);
}
