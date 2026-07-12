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

// Lazily (re)constructs the one real AnthropicAiAssistProvider singleton
// this app uses for every AI feature - imported directly by every
// component (editor/chat/review/scaffold), never resolved through
// justjs.providers.resolve(). @justjs/ai-assist's spi/index.ts explains
// why that path can't work here: boot()'s weave loop calls
// spec.factory() with ZERO arguments, and AiAssistProviderConfig.apiKey
// is required - this app also never lists "aiAssist" in boot()'s
// `aspects` config for the same reason (see app.ts).
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
    cachedProvider = createAiAssistProvider({ apiKey });
    cachedApiKey = apiKey;
  }
  return cachedProvider;
}
