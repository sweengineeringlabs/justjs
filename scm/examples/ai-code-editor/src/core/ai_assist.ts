import { createAiAssistProvider } from "@justjs/ai-assist";
import type { AiAssistProvider } from "@justjs/ai-assist";

const API_KEY_STORAGE_KEY = "justjs:ai-editor:api-key";

let cachedProvider: AiAssistProvider | null = null;
let cachedApiKey: string | null = null;

export function getStoredApiKey(): string {
  try {
    return globalThis.localStorage?.getItem(API_KEY_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setStoredApiKey(key: string): void {
  try {
    if (key) {
      globalThis.localStorage?.setItem(API_KEY_STORAGE_KEY, key);
    } else {
      globalThis.localStorage?.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch {
    // Best-effort only, same graceful-degradation shape as theme.ts and
    // @justjs/memory's DefaultMemoryProvider - a failed persist doesn't
    // block using the key for the rest of this session.
  }
  cachedProvider = null;
  cachedApiKey = null;
}

// Lazily (re)constructs the one real "anthropic"-strategy AiAssistProvider
// singleton this app uses for every AI feature - resolved via
// createAiAssistProvider("anthropic", config) rather than through
// boot()'s own weave loop, since that loop calls spec.factory() with
// ZERO arguments and AnthropicAiAssistConfig.apiKey is required - this
// app also never lists "aiAssist" in boot()'s `aspects` config for the
// same reason (see app.ts). @justjs/ai-assist also registers a
// "bedrock" strategy (justjs#145/ADR-0018) - not wired up in this app
// yet, tracked separately from this file's own scope.
//
// Re-reads localStorage on every call rather than caching indefinitely -
// cheap, and it's what lets Settings' Save/Clear buttons take effect
// immediately without a page reload.
export function getAiAssistProvider(): AiAssistProvider | null {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    return null;
  }
  if (!cachedProvider || cachedApiKey !== apiKey) {
    cachedProvider = createAiAssistProvider("anthropic", { apiKey });
    cachedApiKey = apiKey;
  }
  return cachedProvider;
}
