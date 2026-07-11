import type { FeatureStore } from "@justjs/data";
import { computeFakeEmbedding } from "@justjs/memory";
import type { AppState, AppAction, ChatMessage } from "../core/state.js";
import { memoryProvider } from "../core/memory.js";

// The "assistant remembers things about the user" surface. No real LLM
// call in v1 - the "response" is a dummy generator that either echoes a
// genuinely recalled prior memory (proving query() actually retrieved
// something, not a canned string) or a plain acknowledgement.
//
// Unlike cross-target-demo's simpler components (which rebuild their
// entire innerHTML inside `set dataContext`), the form skeleton here is
// built once in connectedCallback and only #chat-messages re-renders on
// every store update. All three views in this app share one FeatureStore,
// so a dispatch from Dashboard or Curation would otherwise also fire
// Chat's subscribe callback - a full innerHTML rebuild would wipe
// whatever the user was mid-typing in #chat-input for a change that has
// nothing to do with chat at all.
export class ChatElement extends HTMLElement {
  private unsubscribe?: () => void;
  private store?: FeatureStore<AppState, AppAction>;

  set dataContext(ctx: { store?: FeatureStore<AppState, AppAction> } | undefined) {
    this.unsubscribe?.();
    this.store = ctx?.store;
    const render = () => this.renderMessages();
    render();
    this.unsubscribe = this.store?.subscribe(render);
  }

  connectedCallback(): void {
    this.innerHTML = `
      <div id="chat-messages"></div>
      <form id="chat-form">
        <input id="chat-input" type="text" placeholder="Tell me something..." autocomplete="off" />
        <button type="submit">send</button>
      </form>
    `;
    this.querySelector("#chat-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.handleSubmit();
    });
    this.renderMessages();
  }

  private renderMessages(): void {
    const container = this.querySelector("#chat-messages");
    if (!container) {
      return;
    }
    const messages = this.store?.state.value.chatMessages ?? [];
    container.innerHTML = messages
      .map((m) => `<div class="chat-message ${m.role}">${escapeHtml(m.text)}</div>`)
      .join("");
  }

  private async handleSubmit(): Promise<void> {
    const input = this.querySelector<HTMLInputElement>("#chat-input")!;
    const text = input.value.trim();
    if (!text || !this.store) {
      return;
    }
    input.value = "";

    const userId = this.store.state.value.userId;
    const userMessage: ChatMessage = { role: "user", text, ts: Date.now() };
    this.store.dispatch({ type: "CHAT_APPEND", message: userMessage });

    const written = await memoryProvider.write({
      userId,
      kind: "episodic",
      content: text,
      source: "user",
    });

    const [byEmbedding, byText] = await Promise.all([
      memoryProvider.query({
        userId,
        embedding: computeFakeEmbedding(text),
        kind: ["episodic", "structured"],
        limit: 3,
        minScore: 0.2,
      }),
      memoryProvider.query({
        userId,
        text,
        kind: ["episodic", "structured"],
        limit: 3,
      }),
    ]);

    const seen = new Set<string>([written.id]);
    const recalled = [...byEmbedding, ...byText].find((r) => {
      if (seen.has(r.record.id)) {
        return false;
      }
      seen.add(r.record.id);
      return true;
    });

    const replyText = recalled
      ? `I recall you mentioned: "${recalled.record.content}". Got it, I've noted this too.`
      : "Noted — I'll remember that.";
    this.store.dispatch({
      type: "CHAT_APPEND",
      message: { role: "assistant", text: replyText, ts: Date.now() },
    });
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

if (typeof customElements !== "undefined" && !customElements.get("x-chat")) {
  customElements.define("x-chat", ChatElement);
}
