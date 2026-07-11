import type { ConsolidationResult, MemoryQueryResult } from "@justjs/memory";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  ts: number;
}

export interface AppState {
  userId: string;
  chatMessages: ChatMessage[];
  dashboardRecords: MemoryQueryResult[];
  curationResult: ConsolidationResult | null;
}

export type AppAction =
  | { type: "CHAT_APPEND"; message: ChatMessage }
  | { type: "DASHBOARD_SET_RESULTS"; results: MemoryQueryResult[] }
  | { type: "CURATION_SET_RESULT"; result: ConsolidationResult };

// userId is a placeholder here - app.ts always overrides it with
// getOrCreateDeviceUserId() before constructing the real store.
export const initialState: AppState = {
  userId: "",
  chatMessages: [],
  dashboardRecords: [],
  curationResult: null,
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "CHAT_APPEND":
      return { ...state, chatMessages: [...state.chatMessages, action.message] };
    case "DASHBOARD_SET_RESULTS":
      return { ...state, dashboardRecords: action.results };
    case "CURATION_SET_RESULT":
      return { ...state, curationResult: action.result };
    default:
      return state;
  }
}

const USER_ID_STORAGE_KEY = "justjs:memory:userId";

// App-level v1-identity plumbing, not part of @justjs/memory's own
// contract - a device-generated UUID, no real accounts. Same
// graceful-degradation shape as DefaultMemoryProvider itself: falls back
// to an in-memory-only id for this session if localStorage throws or is
// unavailable, rather than crashing boot.
export function getOrCreateDeviceUserId(): string {
  try {
    const existing = globalThis.localStorage?.getItem(USER_ID_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const fresh = genUuid();
    globalThis.localStorage?.setItem(USER_ID_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return genUuid();
  }
}

function genUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `user_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
