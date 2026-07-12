export const NAVIGATE_EVENT = "x-navigate";
export const JUMP_LINE_EVENT = "x-jump-line";

export interface NavigateEventDetail {
  readonly route: string;
}

export interface JumpLineEventDetail {
  readonly line: number;
  // The file the jump target's line belongs to - the reviewed file may
  // no longer be the active one (the user could have switched files
  // since). Optional so a same-file jump within the editor itself (if
  // one is ever added later) doesn't need to pass its own active path.
  readonly filePath?: string;
}

// A small decoupling seam so components (editor/review/scaffold) can
// trigger tab switches and in-editor line jumps without importing app.ts
// (which imports every component - a component importing app.ts back
// would be circular) or reaching into another component's DOM directly.
export function navigateTo(route: string): void {
  document.dispatchEvent(new CustomEvent<NavigateEventDetail>(NAVIGATE_EVENT, { detail: { route } }));
}

// EditorElement's own handler is responsible for switching to `filePath`
// (when given and different from whatever's currently active) before
// scrolling - that invariant lives in the one place that owns the
// textarea, not in every caller that might ever want to jump to a line.
export function jumpToLine(line: number, filePath?: string): void {
  const detail: JumpLineEventDetail = filePath !== undefined ? { line, filePath } : { line };
  document.dispatchEvent(new CustomEvent<JumpLineEventDetail>(JUMP_LINE_EVENT, { detail }));
}
