import type { ReviewFinding } from "@justjs/ai-assist";
import type { FileMap } from "./fs.js";
import { isDescendantOrSelf, renamedPath } from "./fs.js";

export interface ChatUiMessage {
  role: "user" | "assistant";
  text: string;
  ts: number;
}

export interface AppState {
  files: FileMap;
  emptyFolders: string[];
  activeFilePath: string | null;
  reviewFindings: ReviewFinding[];
  // The file review() actually ran against - may differ from
  // activeFilePath if the user switched files since. A finding's
  // line-jump must re-open this path before scrolling, never assume
  // whatever's currently active is still the reviewed file.
  reviewedFilePath: string | null;
  chatMessages: ChatUiMessage[];
}

export type AppAction =
  | { type: "OPEN_FILE"; path: string }
  | { type: "SET_ACTIVE_FILE_CONTENT"; content: string }
  | { type: "SET_ACTIVE_FILE_LANGUAGE"; language: string }
  | { type: "CREATE_FILE"; path: string; content: string; language: string }
  | { type: "CREATE_FOLDER"; path: string }
  | { type: "RENAME_PATH"; oldPath: string; newPath: string; isFolder: boolean }
  | { type: "DELETE_PATH"; path: string; isFolder: boolean }
  | { type: "REPLACE_PROJECT"; files: FileMap; emptyFolders: string[]; activeFilePath: string | null }
  | { type: "SET_REVIEW_FINDINGS"; findings: ReviewFinding[]; reviewedFilePath: string }
  | { type: "CHAT_APPEND"; message: ChatUiMessage };

const STARTER_FILES: FileMap = {
  "src/main.js": {
    content: 'import { greet } from "./utils/greet.js";\n\nconsole.log(greet("world"));\n',
    language: "javascript",
  },
  "src/utils/greet.js": {
    content: "export function greet(name) {\n  return `Hello, ${name}!`;\n}\n",
    language: "javascript",
  },
  "README.md": {
    content: "# Starter project\n\nEdit any file in the sidebar, or use the AI tabs to help.\n",
    language: "text",
  },
};

function defaultState(): AppState {
  return {
    files: STARTER_FILES,
    emptyFolders: [],
    activeFilePath: "src/main.js",
    reviewFindings: [],
    reviewedFilePath: null,
    chatMessages: [],
  };
}

const PROJECT_STORAGE_KEY = "justjs:ai-editor:project";

interface StoredProject {
  files?: FileMap;
  emptyFolders?: string[];
  activeFilePath?: string | null;
}

// Same try/catch graceful-degradation shape as theme.ts/core/ai_assist.ts
// elsewhere in this app - a corrupted or unavailable localStorage falls
// back to the starter tree rather than crashing boot.
export function loadInitialState(): AppState {
  try {
    const raw = globalThis.localStorage?.getItem(PROJECT_STORAGE_KEY);
    if (!raw) {
      return defaultState();
    }
    const stored = JSON.parse(raw) as StoredProject;
    if (!stored.files || typeof stored.files !== "object") {
      return defaultState();
    }
    const files = stored.files;
    const emptyFolders = Array.isArray(stored.emptyFolders) ? stored.emptyFolders : [];
    const activeFilePath =
      stored.activeFilePath && files[stored.activeFilePath] ? stored.activeFilePath : Object.keys(files)[0] ?? null;
    return {
      files,
      emptyFolders,
      activeFilePath,
      reviewFindings: [],
      reviewedFilePath: null,
      chatMessages: [],
    };
  } catch {
    return defaultState();
  }
}

export function persistProject(state: AppState): void {
  try {
    const toStore: StoredProject = {
      files: state.files,
      emptyFolders: state.emptyFolders,
      activeFilePath: state.activeFilePath,
    };
    globalThis.localStorage?.setItem(PROJECT_STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Best-effort only - matches every other localStorage write in this
    // app (theme.ts, core/ai_assist.ts).
  }
}

// The first remaining path in a stable-but-arbitrary order, or null if
// nothing is left - used to pick a new activeFilePath after the current
// one is renamed away or deleted.
function fallbackActiveFilePath(files: FileMap, excludingPath: string): string | null {
  const remaining = Object.keys(files).filter((path) => path !== excludingPath);
  return remaining[0] ?? null;
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "OPEN_FILE":
      return state.files[action.path] ? { ...state, activeFilePath: action.path } : state;

    case "SET_ACTIVE_FILE_CONTENT": {
      const activePath = state.activeFilePath;
      const existing = activePath ? state.files[activePath] : undefined;
      if (!activePath || !existing) {
        return state;
      }
      return {
        ...state,
        files: { ...state.files, [activePath]: { ...existing, content: action.content } },
      };
    }

    case "SET_ACTIVE_FILE_LANGUAGE": {
      const activePath = state.activeFilePath;
      const existing = activePath ? state.files[activePath] : undefined;
      if (!activePath || !existing) {
        return state;
      }
      return {
        ...state,
        files: { ...state.files, [activePath]: { ...existing, language: action.language } },
      };
    }

    case "CREATE_FILE":
      return {
        ...state,
        files: { ...state.files, [action.path]: { content: action.content, language: action.language } },
        activeFilePath: action.path,
      };

    case "CREATE_FOLDER":
      return { ...state, emptyFolders: [...state.emptyFolders, action.path] };

    // Rename collision detection happens in the UI layer before
    // dispatch (the reducer stays pure/unconditional, matching every
    // other reducer in this codebase) - by the time this case runs,
    // `newPath`/its descendants are already known not to collide with
    // anything outside the renamed set.
    case "RENAME_PATH": {
      if (!action.isFolder) {
        if (!state.files[action.oldPath]) {
          return state;
        }
        const { [action.oldPath]: moved, ...rest } = state.files;
        const nextFiles: FileMap = { ...rest, [action.newPath]: moved! };
        const nextActive = state.activeFilePath === action.oldPath ? action.newPath : state.activeFilePath;
        return { ...state, files: nextFiles, activeFilePath: nextActive };
      }
      const nextFiles: FileMap = {};
      for (const [path, node] of Object.entries(state.files)) {
        const nextPath = isDescendantOrSelf(path, action.oldPath)
          ? renamedPath(path, action.oldPath, action.newPath)
          : path;
        nextFiles[nextPath] = node;
      }
      const nextEmptyFolders = state.emptyFolders.map((path) =>
        isDescendantOrSelf(path, action.oldPath) ? renamedPath(path, action.oldPath, action.newPath) : path
      );
      const nextActive =
        state.activeFilePath && isDescendantOrSelf(state.activeFilePath, action.oldPath)
          ? renamedPath(state.activeFilePath, action.oldPath, action.newPath)
          : state.activeFilePath;
      return { ...state, files: nextFiles, emptyFolders: nextEmptyFolders, activeFilePath: nextActive };
    }

    // Deleting a folder always deletes everything inside it (like
    // `rm -rf`) - never special-cased on whether emptyFolders still
    // accurately reflects "nothing in here", which it may not (see
    // core/fs.ts's module comment: emptyFolders is append-only, never
    // pruned when a file is created inside it).
    case "DELETE_PATH": {
      if (!action.isFolder) {
        if (!state.files[action.path]) {
          return state;
        }
        const { [action.path]: _removed, ...nextFiles } = state.files;
        const nextActive =
          state.activeFilePath === action.path
            ? fallbackActiveFilePath(state.files, action.path)
            : state.activeFilePath;
        return { ...state, files: nextFiles, activeFilePath: nextActive };
      }
      const nextFiles: FileMap = {};
      for (const [path, node] of Object.entries(state.files)) {
        if (!isDescendantOrSelf(path, action.path)) {
          nextFiles[path] = node;
        }
      }
      const nextEmptyFolders = state.emptyFolders.filter((path) => !isDescendantOrSelf(path, action.path));
      const nextActive =
        state.activeFilePath && isDescendantOrSelf(state.activeFilePath, action.path)
          ? fallbackActiveFilePath(nextFiles, state.activeFilePath)
          : state.activeFilePath;
      return { ...state, files: nextFiles, emptyFolders: nextEmptyFolders, activeFilePath: nextActive };
    }

    case "REPLACE_PROJECT":
      return {
        ...state,
        files: action.files,
        emptyFolders: action.emptyFolders,
        activeFilePath: action.activeFilePath,
        reviewFindings: [],
        reviewedFilePath: null,
      };

    case "SET_REVIEW_FINDINGS":
      return { ...state, reviewFindings: action.findings, reviewedFilePath: action.reviewedFilePath };

    case "CHAT_APPEND":
      return { ...state, chatMessages: [...state.chatMessages, action.message] };

    default:
      return state;
  }
}
