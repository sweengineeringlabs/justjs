// A real command-line shell for this app's own virtual filesystem - not
// an AI-backed interpreter, and not a real OS shell (this app is
// browser-only, no backend to shell out to). Pure - no state, no
// dispatch, mirrors fs.ts's own "pure helpers" style: the caller
// (workspace.ts) owns cwd/history as component state and dispatches
// the returned action, the same "helpers stay pure, caller owns
// dispatch" split editor.ts/scaffold.ts already use for create/rename/
// delete.

import type { AppAction } from "./state.js";
import { baseName, buildTree, collectFolderPaths, inferLanguage, isDescendantOrSelf, pathExists } from "./fs.js";
import type { FileMap, TreeNode } from "./fs.js";

export interface CliCommandResult {
  // "" for a silent success - mkdir/touch/rm/mv print nothing on
  // success, matching real shell conventions.
  readonly output: string;
  // The new cwd - unchanged unless the command was `cd`.
  readonly cwd: string;
  // Present only if the command mutates the filesystem - the caller
  // dispatches it, this module never touches a store.
  readonly action?: AppAction;
  // Explicit, not string-sniffed from `output` - lets the UI style
  // error lines differently.
  readonly isError?: boolean;
}

function ok(output: string, cwd: string, action?: AppAction): CliCommandResult {
  return action !== undefined ? { output, cwd, action } : { output, cwd };
}

function err(output: string, cwd: string): CliCommandResult {
  return { output, cwd, isError: true };
}

// Splits raw target on "/", dropping empty segments (handles trailing
// slashes and "//" for free), then walks applying ".."  (pop, a no-op
// on an already-empty stack) and "." (skip). Deliberately NOT built on
// normalizePath() - that collapses slashes but does not resolve "."/
// ".." at all, which this needs.
function resolvePath(cwd: string, target: string): string {
  const startSegments = target.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  const segments = [...startSegments];
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") {
      continue;
    }
    if (seg === "..") {
      segments.pop();
      continue;
    }
    segments.push(seg);
  }
  return segments.join("/");
}

function isRealFolder(files: FileMap, emptyFolders: string[], path: string): boolean {
  return path === "" || collectFolderPaths(files, emptyFolders).has(path);
}

function promptPath(cwd: string): string {
  return cwd ? `/${cwd}` : "/";
}

function findChildren(nodes: TreeNode[], dir: string): TreeNode[] | null {
  if (dir === "") {
    return nodes;
  }
  const [head, ...restSegs] = dir.split("/");
  const match = nodes.find((n) => n.type === "folder" && n.name === head);
  if (!match || match.type !== "folder") {
    return null;
  }
  const rest = restSegs.join("/");
  return rest === "" ? match.children : findChildren(match.children, rest);
}

function runPwd(cwd: string): CliCommandResult {
  return ok(promptPath(cwd), cwd);
}

function runLs(args: string[], cwd: string, files: FileMap, emptyFolders: string[]): CliCommandResult {
  const target = args[0] ? resolvePath(cwd, args[0]) : cwd;
  const children = findChildren(buildTree(files, emptyFolders), target);
  if (children === null) {
    return err(`ls: ${args[0] ?? promptPath(cwd)}: No such directory`, cwd);
  }
  if (children.length === 0) {
    return ok("(empty)", cwd);
  }
  return ok(children.map((n) => (n.type === "folder" ? `${n.name}/` : n.name)).join("  "), cwd);
}

function runCd(args: string[], cwd: string, files: FileMap, emptyFolders: string[]): CliCommandResult {
  // Bare `cd` means "go to root" - resolvePath(cwd, "") would be a
  // relative no-op (zero segments to append), not root, so this must
  // bypass it entirely rather than route through the same resolve call
  // `ls`'s "no argument" case correctly does.
  if (!args[0]) {
    return ok("", "");
  }
  const target = resolvePath(cwd, args[0]);
  if (!isRealFolder(files, emptyFolders, target)) {
    return err(`cd: ${args[0]}: No such directory`, cwd);
  }
  return ok("", target);
}

function runCat(args: string[], cwd: string, files: FileMap): CliCommandResult {
  if (!args[0]) {
    return err("cat: missing file operand", cwd);
  }
  const target = resolvePath(cwd, args[0]);
  const file = files[target];
  if (file) {
    return ok(file.content, cwd);
  }
  return err(`cat: ${args[0]}: No such file or directory`, cwd);
}

function runMkdir(args: string[], cwd: string, files: FileMap, emptyFolders: string[]): CliCommandResult {
  if (!args[0]) {
    return err("mkdir: missing operand", cwd);
  }
  const target = resolvePath(cwd, args[0]);
  if (pathExists(files, emptyFolders, target)) {
    return err(`mkdir: ${args[0]}: File exists`, cwd);
  }
  return ok("", cwd, { type: "CREATE_FOLDER", path: target });
}

function runTouch(args: string[], cwd: string, files: FileMap, emptyFolders: string[]): CliCommandResult {
  if (!args[0]) {
    return err("touch: missing file operand", cwd);
  }
  const target = resolvePath(cwd, args[0]);
  if (files[target]) {
    // Real touch's only job on an existing file is bumping mtime -
    // FileNode has no mtime field, and re-dispatching CREATE_FILE would
    // clobber real content with "". No-op is the faithful behavior.
    return ok("", cwd);
  }
  if (collectFolderPaths(files, emptyFolders).has(target)) {
    return err(`touch: cannot touch '${args[0]}': Is a directory`, cwd);
  }
  return ok("", cwd, { type: "CREATE_FILE", path: target, content: "", language: inferLanguage(target) });
}

function runRm(args: string[], cwd: string, files: FileMap, emptyFolders: string[]): CliCommandResult {
  const recursive = args.some((a) => a.startsWith("-") && a.includes("r"));
  const pathArgs = args.filter((a) => !a.startsWith("-"));
  if (!pathArgs[0]) {
    return err("rm: missing operand", cwd);
  }
  const target = resolvePath(cwd, pathArgs[0]);
  if (!pathExists(files, emptyFolders, target)) {
    return err(`rm: ${pathArgs[0]}: No such file or directory`, cwd);
  }
  const isFolder = !files[target];
  if (isFolder && !recursive) {
    return err(`rm: ${pathArgs[0]}: is a directory (use rm -r)`, cwd);
  }
  return ok("", cwd, { type: "DELETE_PATH", path: target, isFolder });
}

function runMv(args: string[], cwd: string, files: FileMap, emptyFolders: string[]): CliCommandResult {
  if (!args[0] || !args[1]) {
    return err("mv: missing operand", cwd);
  }
  const src = resolvePath(cwd, args[0]);
  if (!pathExists(files, emptyFolders, src)) {
    return err(`mv: ${args[0]}: No such file or directory`, cwd);
  }
  const destArg = resolvePath(cwd, args[1]);
  // Real `mv file dir/` moves into that directory under its own
  // basename, rather than requiring the caller to spell out the full
  // destination path every time.
  const finalDest = isRealFolder(files, emptyFolders, destArg) ? `${destArg ? `${destArg}/` : ""}${baseName(src)}` : destArg;
  if (finalDest === src) {
    return ok("", cwd);
  }
  const isFolder = !files[src];
  if (isFolder && isDescendantOrSelf(finalDest, src)) {
    return err(`mv: cannot move '${args[0]}' into itself`, cwd);
  }
  if (pathExists(files, emptyFolders, finalDest)) {
    return err(`mv: ${args[1]}: File exists`, cwd);
  }
  return ok("", cwd, { type: "RENAME_PATH", oldPath: src, newPath: finalDest, isFolder });
}

const HELP_TEXT = [
  "Commands: pwd, ls [path], cd [path], cat <path>, mkdir <path>,",
  "touch <path>, rm [-r] <path>, mv <src> <dest>, echo <text>, clear, help",
].join("\n");

export function runCliCommand(rawLine: string, cwd: string, files: FileMap, emptyFolders: string[]): CliCommandResult {
  const parts = rawLine.trim().split(/\s+/).filter(Boolean);
  const [cmd, ...args] = parts;
  switch (cmd) {
    case undefined:
      return ok("", cwd);
    case "pwd":
      return runPwd(cwd);
    case "ls":
      return runLs(args, cwd, files, emptyFolders);
    case "cd":
      return runCd(args, cwd, files, emptyFolders);
    case "cat":
      return runCat(args, cwd, files);
    case "mkdir":
      return runMkdir(args, cwd, files, emptyFolders);
    case "touch":
      return runTouch(args, cwd, files, emptyFolders);
    case "rm":
      return runRm(args, cwd, files, emptyFolders);
    case "mv":
      return runMv(args, cwd, files, emptyFolders);
    case "echo":
      return ok(args.join(" "), cwd);
    case "help":
      return ok(HELP_TEXT, cwd);
    default:
      return err(`${cmd}: command not found`, cwd);
  }
}
