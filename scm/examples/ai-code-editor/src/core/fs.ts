// Pure path/tree helpers for the file explorer - no state, nothing here
// touches the store or localStorage. The virtual filesystem itself is a
// flat Record<path, FileNode> (see core/state.ts) - folders are never
// stored as separate nodes, only inferred here at render time by walking
// path prefixes. This mirrors how git/S3 represent directories (implied
// by key prefixes, not real container objects), specifically to keep
// rename/delete as simple string-prefix operations over a flat map
// instead of recursive tree-mutation code.

const PATH_SEPARATOR = "/";

export interface FileNode {
  content: string;
  language: string;
}

export type FileMap = Record<string, FileNode>;

// Trims, collapses "//", strips leading/trailing "/", and drops empty
// segments - so "src/utils", "src/utils/", and "/src//utils" can never
// coexist as different keys in `files`/`emptyFolders`.
export function normalizePath(raw: string): string {
  const collapsed = raw.trim().replace(/\/+/g, PATH_SEPARATOR);
  const segments = collapsed.split(PATH_SEPARATOR).filter((segment) => segment.length > 0);
  return segments.join(PATH_SEPARATOR);
}

// `path === ancestorPath || path.startsWith(ancestorPath + "/")` -
// deliberately NOT a bare startsWith, which would also match
// "src2/file.js" when operating on folder "src". Every folder-scoped op
// (rename, delete, active-path fixup) goes through this one function so
// the boundary rule is defined exactly once.
export function isDescendantOrSelf(path: string, ancestorPath: string): boolean {
  if (path === ancestorPath) {
    return true;
  }
  const prefix = ancestorPath + PATH_SEPARATOR;
  return path.startsWith(prefix);
}

export function parentPath(path: string): string | null {
  const separatorIndex = path.lastIndexOf(PATH_SEPARATOR);
  return separatorIndex === -1 ? null : path.slice(0, separatorIndex);
}

export function baseName(path: string): string {
  const separatorIndex = path.lastIndexOf(PATH_SEPARATOR);
  return separatorIndex === -1 ? path : path.slice(separatorIndex + 1);
}

// Rewrites `path` (a descendant-or-self of `oldPrefix`, per
// isDescendantOrSelf) onto `newPrefix`. Callers must check
// isDescendantOrSelf(path, oldPrefix) before calling this.
export function renamedPath(path: string, oldPrefix: string, newPrefix: string): string {
  if (path === oldPrefix) {
    return newPrefix;
  }
  const rest = path.slice(oldPrefix.length + 1);
  return `${newPrefix}${PATH_SEPARATOR}${rest}`;
}

const EXTENSION_LANGUAGE: Record<string, string> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
};

export function inferLanguage(path: string): string {
  const name = baseName(path);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex === -1) {
    return "text";
  }
  const extension = name.slice(dotIndex + 1).toLowerCase();
  return EXTENSION_LANGUAGE[extension] ?? "text";
}

export interface TreeFolder {
  readonly type: "folder";
  readonly path: string;
  readonly name: string;
  children: TreeNode[];
}

export interface TreeFile {
  readonly type: "file";
  readonly path: string;
  readonly name: string;
}

export type TreeNode = TreeFolder | TreeFile;

function segmentCount(path: string): number {
  return path.split(PATH_SEPARATOR).length;
}

// True if `path` is already occupied - either a real file key, or a
// folder (explicitly created, or only implied by a file underneath it).
// The one shared collision check used by every create/rename site
// (editor.ts's sidebar, scaffold.ts's "Create file").
export function pathExists(files: FileMap, emptyFolders: string[], path: string): boolean {
  if (files[path]) {
    return true;
  }
  return collectFolderPaths(files, emptyFolders).has(path);
}

// Every ancestor of every file path, unioned (via Set - a folder that's
// both explicitly created via +Folder AND implied by a file underneath
// it collapses to one entry, not two) with the explicitly-created
// `emptyFolders` list. Exported for collision-detection callers, not
// just buildTree()'s own internal use - creating/renaming a file/folder
// needs to know every path already considered "occupied", including
// folders that only exist implicitly via a file underneath them.
export function collectFolderPaths(files: FileMap, emptyFolders: string[]): Set<string> {
  const result = new Set<string>();
  const addWithAncestors = (path: string): void => {
    let current: string | null = path;
    while (current !== null && !result.has(current)) {
      result.add(current);
      current = parentPath(current);
    }
  };
  for (const path of emptyFolders) {
    addWithAncestors(path);
  }
  for (const path of Object.keys(files)) {
    const parent = parentPath(path);
    if (parent !== null) {
      addWithAncestors(parent);
    }
  }
  return result;
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "folder" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  for (const node of sorted) {
    if (node.type === "folder") {
      node.children = sortTree(node.children);
    }
  }
  return sorted;
}

// Pure, rebuilt on every render, never stored. Folder nodes are created
// in ascending depth order (by segment count) so a parent node always
// exists in `folderByPath` before any child looks it up - no recursive
// linking pass needed.
export function buildTree(files: FileMap, emptyFolders: string[]): TreeNode[] {
  const folderPaths = [...collectFolderPaths(files, emptyFolders)].sort(
    (a, b) => segmentCount(a) - segmentCount(b)
  );
  const folderByPath = new Map<string, TreeFolder>();
  const rootChildren: TreeNode[] = [];

  for (const path of folderPaths) {
    const node: TreeFolder = { type: "folder", path, name: baseName(path), children: [] };
    folderByPath.set(path, node);
    const parent = parentPath(path);
    const bucket = parent === null ? rootChildren : folderByPath.get(parent)!.children;
    bucket.push(node);
  }
  for (const path of Object.keys(files)) {
    const node: TreeFile = { type: "file", path, name: baseName(path) };
    const parent = parentPath(path);
    const bucket = parent === null ? rootChildren : folderByPath.get(parent)!.children;
    bucket.push(node);
  }

  return sortTree(rootChildren);
}
