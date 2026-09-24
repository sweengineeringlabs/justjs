// Browser error types — ported from Rust error.rs.
// WASM-safe TS: no enums, no optional chaining.

// ---------------------------------------------------------------------------
// Error kind constants (replacing Rust enum variants)
// ---------------------------------------------------------------------------

export let ERR_LAUNCH_FAILED: string = "launch_failed";
export let ERR_CONNECTION_FAILED: string = "connection_failed";
export let ERR_WEBSOCKET: string = "websocket";
export let ERR_CDP: string = "cdp";
export let ERR_NAVIGATION_FAILED: string = "navigation_failed";
export let ERR_ELEMENT_NOT_FOUND: string = "element_not_found";
export let ERR_TIMEOUT: string = "timeout";
export let ERR_JAVASCRIPT: string = "javascript";
export let ERR_SCREENSHOT_FAILED: string = "screenshot_failed";
export let ERR_SCREENSHOT_MISMATCH: string = "screenshot_mismatch";
export let ERR_BROWSER_NOT_FOUND: string = "browser_not_found";
export let ERR_BROWSER_CLOSED: string = "browser_closed";
export let ERR_PAGE_CLOSED: string = "page_closed";
export let ERR_INVALID_ARGUMENT: string = "invalid_argument";
export let ERR_IO: string = "io";

// ---------------------------------------------------------------------------
// BrowserError class
// ---------------------------------------------------------------------------

export class BrowserError {
  kind: string;
  message: string;
  code: number;

  constructor(kind: string, message: string, code: number) {
    this.kind = kind;
    this.message = message;
    this.code = code;
  }

  toString(): string {
    if (this.kind === ERR_CDP) {
      return "CDP error (" + this.code + "): " + this.message;
    }
    return this.kind + ": " + this.message;
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function browserError(kind: string, message: string): BrowserError {
  return new BrowserError(kind, message, 0);
}

export function cdpError(code: number, message: string): BrowserError {
  return new BrowserError(ERR_CDP, message, code);
}

export function timeoutError(message: string): BrowserError {
  return new BrowserError(ERR_TIMEOUT, message, 0);
}

export function elementNotFound(selector: string): BrowserError {
  return new BrowserError(ERR_ELEMENT_NOT_FOUND, selector, 0);
}

export function launchFailed(message: string): BrowserError {
  return new BrowserError(ERR_LAUNCH_FAILED, message, 0);
}

export function screenshotFailed(message: string): BrowserError {
  return new BrowserError(ERR_SCREENSHOT_FAILED, message, 0);
}

export function jsError(message: string): BrowserError {
  return new BrowserError(ERR_JAVASCRIPT, message, 0);
}
