// Google Gemini is the only one of the 3 real providers with a real,
// official brand mark in simple-icons' catalog - OpenAI and Stability
// AI aren't (same real gap AWS/Azure/Heroku hit in workspace.ts's
// CLOUD_PROVIDER_CATALOG) - both fall back to a plain colored monogram
// instead of a fabricated logo shape.
import { geminiLogo } from "../core/brand_logos.js";
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
import { CartoonBase } from "../features/cartoon/cartoon_component.gen.js";

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
//
// Extends CartoonBase (justweb-generated, justjs#121 - the final
// sub-issue of justjs#113's epic) for real value now. Unlike SCM/PM/
// Cloud/Communication (justjs#124-#126, #120), this has no resource-
// list step at all, so no existing (or new) sibling control fits -
// stays a direct dom.elements spec instead (matching editor/chat/
// review/scaffold's own shape), see cartoon_component.yaml's own
// comment. grid-view/detail-view are permanent siblings toggled via
// `hidden` (justjs#127's own precedent). See justjs#113's shared note
// for why customElement.tagName is deliberately not set (CartoonBase
// self-registers under its harmless default js-cartoon; CartoonElement
// keeps its own explicit x-cartoon registration).
export class CartoonElement extends CartoonBase {
  private selectedProviderId: string | null = null;
  private connectStatusMessage: string | null = null;
  private connectError: string | null = null;
  private connecting = false;

  private generatedImageData: GeneratedImage | null = null;
  private generateError: string | null = null;
  private generating = false;

  connectedCallback(): void {
    this.innerHTML = `
      <div id="cartoon-grid-view" data-part="grid-view">
        <div class="dash-subnav">
          <h2 class="workspace-stage-title">🎨 Cartoon Generator</h2>
        </div>
        <p class="connect-hint">Tap a provider to connect a real account and generate a real cartoon image from a text prompt. API keys are stored only on this device, sent directly to that provider — never proxied through a backend (this app has none). Every generation is a real, billed API call - each provider's own screen shows the real approximate cost before you generate.</p>
        <div class="provider-grid">
          ${CARTOON_PROVIDER_CATALOG.map(
            (p) => `
              <button type="button" class="provider-card" data-cartoon-provider-id="${p.id}">
                <view-badge data-badge-for="${p.id}"></view-badge>
                <span class="provider-name">${escapeHtml(p.name)}</span>
                <span class="provider-check"></span>
              </button>
            `,
          ).join("")}
        </div>
      </div>
      <div id="cartoon-detail-view" data-part="detail-view" hidden>
        <div class="dash-subnav">
          <button id="cartoon-back-btn" data-part="back-btn" class="dash-back-btn" type="button">← Cartoon Generator</button>
          <h2 class="workspace-stage-title"><view-badge id="cartoon-header-badge" data-part="header-badge"></view-badge> <span data-part="header-name"></span></h2>
        </div>
        <p class="settings-disclosure" data-part="connect-disclosure"></p>
        <div class="connect-form">
          <input id="cartoon-connect-token" data-part="connect-token" type="password" autocomplete="off" spellcheck="false" />
          <div class="connect-actions">
            <button id="cartoon-connect-btn" data-part="connect-btn" type="button">Connect</button>
            <button id="cartoon-disconnect-btn" data-part="disconnect-btn" type="button" class="btn-secondary" hidden>Disconnect</button>
          </div>
          <p id="cartoon-connect-status" data-part="connect-status" class="connect-status"></p>
        </div>
        <div id="cartoon-generate-section" data-part="generate-section" hidden>
          <p class="connect-hint" data-part="generate-disclosure"></p>
          <div class="connect-form">
            <view-prompt-field id="cartoon-prompt" data-part="prompt"></view-prompt-field>
            <div class="connect-actions">
              <button id="cartoon-generate-btn" data-part="generate-btn" type="button">Generate Cartoon</button>
            </div>
            <p id="cartoon-generate-status" data-part="generate-status" class="connect-status"></p>
          </div>
          <img class="cartoon-generated-image" data-part="generated-image" alt="Generated cartoon" hidden />
        </div>
      </div>
    `;
    // Binds this.gridView/detailView/backBtn/headerBadge/headerName/
    // connectDisclosure/connectToken/connectBtn/disconnectBtn/
    // connectStatus/generateSection/generateDisclosure/prompt/
    // generateBtn/generateStatus/generatedImage via real data-part
    // lookups - must run after the markup above exists, since
    // CartoonBase's own connectedCallback() calls _bindElements()
    // synchronously.
    super.connectedCallback();

    // placeholder/rows never vary per provider (unlike the original's
    // own per-render assignment, an artifact of rebuilding <view-prompt-
    // field> fresh every visit) - a real simplification enabled by this
    // now being one persistent, bound-once element instead.
    (this.prompt as PromptFieldView).placeholder = "Describe what to draw, e.g. a fox riding a skateboard";
    (this.prompt as PromptFieldView).rows = 3;

    this.gridView.querySelectorAll<HTMLButtonElement>("[data-cartoon-provider-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.cartoonProviderId;
        if (!id) {
          return;
        }
        this.selectedProviderId = id;
        this.connectStatusMessage = null;
        this.connectError = null;
        this.generatedImageData = null;
        this.generateError = null;
        // The prompt field and token input are now persistent, shared
        // elements across every provider (unlike the original's own
        // fresh-per-visit markup) - cleared explicitly here, at the
        // same real reset point the original's own full rebuild
        // implicitly relied on, so switching providers doesn't leak
        // one provider's in-progress prompt text (or, worse, its
        // typed-but-not-yet-submitted API key) into another's.
        (this.prompt as PromptFieldView).value = "";
        this.connectToken.value = "";
        this.renderView();
      });
    });
    this.gridView.querySelectorAll<Element>("view-badge[data-badge-for]").forEach((el) => {
      const provider = CARTOON_PROVIDER_CATALOG.find((p) => p.id === (el as HTMLElement).dataset.badgeFor);
      if (provider) {
        setBadgeProps(el, provider);
      }
    });

    this.backBtn.addEventListener("click", () => {
      this.selectedProviderId = null;
      this.renderView();
    });
    this.connectBtn.addEventListener("click", () => {
      const provider = this.currentProvider();
      if (provider) {
        void this.handleConnect(provider);
      }
    });
    this.disconnectBtn.addEventListener("click", () => {
      const provider = this.currentProvider();
      if (!provider) {
        return;
      }
      setStoredCartoonToken(provider.id, "");
      this.connectStatusMessage = null;
      this.connectError = null;
      this.generatedImageData = null;
      this.generateError = null;
      this.renderDetail();
    });
    this.generateBtn.addEventListener("click", () => {
      const provider = this.currentProvider();
      if (provider) {
        void this.handleGenerate(provider);
      }
    });

    this.renderView();
  }

  private currentProvider(): CartoonProvider | undefined {
    return CARTOON_PROVIDER_CATALOG.find((p) => p.id === this.selectedProviderId);
  }

  private renderView(): void {
    if (this.selectedProviderId) {
      const provider = this.currentProvider();
      if (provider) {
        this.renderDetail();
        return;
      }
      this.selectedProviderId = null;
    }
    this.renderGridView();
  }

  private isProviderConnected(p: CartoonProvider): boolean {
    return getStoredCartoonToken(p.id).length > 0;
  }

  private renderGridView(): void {
    this.detailView.hidden = true;
    this.gridView.hidden = false;
    this.gridView.querySelectorAll<HTMLButtonElement>("[data-cartoon-provider-id]").forEach((btn) => {
      const id = btn.dataset.cartoonProviderId;
      const provider = CARTOON_PROVIDER_CATALOG.find((p) => p.id === id);
      if (!provider) {
        return;
      }
      const connected = this.isProviderConnected(provider);
      btn.classList.toggle("selected", connected);
      const check = btn.querySelector<HTMLElement>(".provider-check");
      if (check) {
        check.textContent = connected ? "✓ Connected" : "";
      }
    });
  }

  private renderDetail(): void {
    const provider = this.currentProvider();
    if (!provider) {
      this.renderGridView();
      return;
    }
    this.gridView.hidden = true;
    this.detailView.hidden = false;
    const connected = this.isProviderConnected(provider);

    setBadgeProps(this.headerBadge, provider);
    this.headerName.textContent = provider.name;
    this.connectDisclosure.textContent = `Stored only on this device. Sent directly to ${provider.name} when you connect.`;
    this.connectBtn.textContent = connected ? "Reconnect" : "Connect";
    this.disconnectBtn.hidden = !connected;
    this.connectStatus.textContent = this.connecting
      ? "Connecting…"
      : this.connectError
        ? `⚠️ ${this.connectError}`
        : this.connectStatusMessage
          ? `✓ ${this.connectStatusMessage}`
          : "";
    this.connectStatus.classList.toggle("connect-status-error", !!this.connectError);

    this.generateSection.hidden = !connected;
    if (connected) {
      this.generateDisclosure.textContent = provider.disclosure;
      this.generateBtn.textContent = this.generating ? "Generating…" : "Generate Cartoon";
      this.generateStatus.textContent = this.generating
        ? "Generating - this is a real, billed API call…"
        : this.generateError
          ? `⚠️ ${this.generateError}`
          : "";
      this.generateStatus.classList.toggle("connect-status-error", !!this.generateError);
      if (this.generatedImageData) {
        (this.generatedImage as HTMLImageElement).src = buildImageDataUrl(this.generatedImageData);
        this.generatedImage.hidden = false;
      } else {
        this.generatedImage.hidden = true;
      }
    }

    // connect() is a real, free key-check (never billed) - safe to
    // auto-fire on revisit, same lazy-validation posture every other
    // provider in this app uses. generate() never auto-fires - it's a
    // real, billed call, always gated behind an explicit click.
    if (connected && !this.connectStatusMessage && !this.connectError && !this.connecting) {
      void this.handleConnect(provider);
    }
  }

  private async handleConnect(provider: CartoonProvider): Promise<void> {
    const token = this.connectToken.value.trim() || getStoredCartoonToken(provider.id);
    if (!token) {
      this.connectError = "Paste an API key first.";
      this.renderDetail();
      return;
    }
    // The token input is now a persistent, shared element (unlike the
    // original's own fresh-per-render markup, which cleared it as a
    // byproduct of a full rebuild on every connect attempt, success or
    // failure) - cleared explicitly here to match that same real
    // behavior, and every already-shipped *-connect control in this
    // epic (justjs#120/#124-#126) still does the same thing internally.
    this.connectToken.value = "";

    this.connecting = true;
    this.connectError = null;
    this.connectBtn.disabled = true;
    this.connectStatus.textContent = "Connecting…";
    try {
      const status = await CARTOON_CONNECTORS[provider.id]!(token);
      setStoredCartoonToken(provider.id, token);
      this.connectStatusMessage = status;
      this.connectError = null;
    } catch (e) {
      this.connectError = e instanceof Error ? e.message : String(e);
      this.connectStatusMessage = null;
    } finally {
      this.connecting = false;
      this.connectBtn.disabled = false;
      this.renderDetail();
    }
  }

  private async handleGenerate(provider: CartoonProvider): Promise<void> {
    const prompt = (this.prompt as PromptFieldView).value.trim();
    if (!prompt) {
      this.generateError = "Describe what to draw first.";
      this.renderDetail();
      return;
    }

    const token = getStoredCartoonToken(provider.id);
    this.generating = true;
    this.generateError = null;
    this.renderDetail();
    try {
      this.generatedImageData = await CARTOON_GENERATORS[provider.id]!(token, prompt);
      this.generateError = null;
    } catch (e) {
      this.generateError = e instanceof Error ? e.message : String(e);
      this.generatedImageData = null;
    } finally {
      this.generating = false;
      this.renderDetail();
    }
  }
}

if (typeof customElements !== "undefined" && !customElements.get("x-cartoon")) {
  customElements.define("x-cartoon", CartoonElement);
}
