// Browser — top-level browser automation API. Ported from Rust browser.rs.

import { spawnSync } from "child_process";
import { CdpClient } from "./cdp_client";
import { Page } from "./page";
import {
  LaunchConfig, BrowserProcess, defaultLaunchConfig,
  launchBrowserProcess, waitForDebugger,
  getWsUrl, findPersistentBridgeScript, findRelayScript,
} from "./manager";
import { findAvailablePort } from "./server";
import { Viewport, viewportDefault } from "./types";

// ---------------------------------------------------------------------------
// Process cleanup — kill all tracked browsers on exit to prevent orphaned Chrome
// ---------------------------------------------------------------------------

let activeBrowsers: Browser[] = [];
let exitHandlerRegistered: boolean = false;

function registerExitHandler(): void {
  if (exitHandlerRegistered) return;
  exitHandlerRegistered = true;
  process.on("exit", () => {
    let i: number = 0;
    while (i < activeBrowsers.length) {
      try { activeBrowsers[i].process.kill(); } catch (_e) { /* ignore */ }
      i = i + 1;
    }
  });
}

// ---------------------------------------------------------------------------
// Browser class
// ---------------------------------------------------------------------------

export class Browser {
  cdp: CdpClient;
  process: BrowserProcess;
  config: LaunchConfig;
  pages: Page[];

  constructor(cdp: CdpClient, browserProcess: BrowserProcess, config: LaunchConfig) {
    this.cdp = cdp;
    this.process = browserProcess;
    this.config = config;
    this.pages = [];
  }

  // -----------------------------------------------------------------------
  // Launch
  // -----------------------------------------------------------------------

  static launch(config: LaunchConfig): Browser {
    let bp: BrowserProcess = launchBrowserProcess(config);
    let wsUrl: string = waitForDebugger(bp.port, config.timeout);
    if (wsUrl === "") {
      bp.kill();
      throw new Error("Chrome debugger did not respond within " + config.timeout + "ms on port " + bp.port);
    }

    // Native (jsc): direct WebSocket to Chrome — zero bridge processes
    let cdp: CdpClient = CdpClient.connectDirect(wsUrl, "", config.timeout);
    let browser: Browser = new Browser(cdp, bp, config);
    registerExitHandler();
    activeBrowsers.push(browser);
    return browser;
  }

  static launchDefault(): Browser {
    return Browser.launch(defaultLaunchConfig());
  }

  // -----------------------------------------------------------------------
  // Page management
  // -----------------------------------------------------------------------

  newPage(): Page {
    // The bridge creates a new WebSocket connection per command, so sessions
    // don't persist. Instead, use the page's direct WebSocket URL (sessionless).
    // The initial Chrome launch already has a page at about:blank — reuse it
    // for the first page, or create a new target for subsequent pages.
    let pageCdp: CdpClient;
    let targetId: string = "";

    if (this.pages.length === 0) {
      // Reuse the initial page (already connected)
      pageCdp = this.cdp;
      targetId = "initial";
    } else if (this.cdp.isNative()) {
      // Native: create a new target and attach via session on the existing WS connection.
      // Sessions are multiplexed — no new port or bridge process needed.
      let newTargetId: string = this.cdp.targetCreateTarget("about:blank");
      if (newTargetId === "") {
        throw new Error("Failed to create new target");
      }
      let sessionId: string = this.cdp.targetAttachToTarget(newTargetId);
      if (sessionId === "") {
        throw new Error("Failed to attach to new target (targetId=" + newTargetId + ")");
      }
      pageCdp = this.cdp.withSession(sessionId);
      targetId = newTargetId;
    } else {
      // Fallback: open a new tab, find its WS URL, create a new connection.
      this.cdp.evaluate("window.open('about:blank')");
      this.sleepMs(500);
      let newWs: string = this.findNewPageWsUrl();
      if (newWs === "") {
        throw new Error("Failed to get WS URL for new page");
      }
      let pageStart: number = 19200 + Math.floor(Math.random() * 800);
      let pagePort: number = findAvailablePort(pageStart, 200);
      if (pagePort <= 0) {
        throw new Error("No available port found for new page bridge (searched " + pageStart + "-" + (pageStart + 199) + ").");
      }
      pageCdp = CdpClient.createPersistent(
        newWs, this.cdp.bridgeScript, this.cdp.relayScript, "", pagePort
      );
      targetId = "page-" + this.pages.length;
    }

    let vp: Viewport = this.config.viewport;
    let page: Page = new Page(pageCdp, targetId, "", vp, this.config.timeout, this.config.slowMo);
    this.pages.push(page);
    return page;
  }

  private findNewPageWsUrl(): string {
    let url: string = "http://localhost:" + this.process.port + "/json";
    try {
      let result = spawnSync("curl", ["-s", "--max-time", "2", url], {
        encoding: "utf-8",
        timeout: 5000,
      });
      if (result.status !== 0) return "";
      let targets = JSON.parse(result.stdout);
      // Return the last page target (newest)
      let i: number = targets.length - 1;
      while (i >= 0) {
        if (targets[i].type === "page" && targets[i].webSocketDebuggerUrl) {
          return targets[i].webSocketDebuggerUrl;
        }
        i = i - 1;
      }
    } catch (_e) { /* ignore */ }
    return "";
  }

  private sleepMs(ms: number): void {
    try {
      spawnSync("sleep", [String(ms / 1000)], { timeout: ms + 1000, stdio: "ignore" });
    } catch (_e) {
      try {
        spawnSync("ping", ["-n", "1", "127.0.0.1"], { timeout: ms + 1000, stdio: "ignore" });
      } catch (_e2) { /* ignore */ }
    }
  }

  // -----------------------------------------------------------------------
  // Info
  // -----------------------------------------------------------------------

  version(): string {
    let result: string = this.cdp.sendJson("Browser.getVersion", "");
    if (result === "") return "";
    return this.cdp.extractStringField(result, "product");
  }

  userAgent(): string {
    let result: string = this.cdp.sendJson("Browser.getVersion", "");
    if (result === "") return "";
    return this.cdp.extractStringField(result, "userAgent");
  }

  // -----------------------------------------------------------------------
  // Context management
  // -----------------------------------------------------------------------

  newContext(): BrowserContext {
    let result: string = this.cdp.sendJson("Target.createBrowserContext", "");
    let contextId: string = "";
    if (result !== "") {
      contextId = this.cdp.extractStringField(result, "browserContextId");
    }
    return new BrowserContext(this, contextId);
  }

  disposeContext(contextId: string): void {
    this.cdp.sendJson("Target.disposeBrowserContext", '{"browserContextId":"' + contextId + '"}');
  }

  // -----------------------------------------------------------------------
  // Close
  // -----------------------------------------------------------------------

  close(): void {
    let i: number = 0;
    while (i < this.pages.length) {
      this.pages[i].close();
      i = i + 1;
    }
    this.pages = [];
    this.cdp.closeBridge();
    this.process.kill();

    // Remove from active list so exit handler doesn't double-kill
    let idx: number = activeBrowsers.indexOf(this);
    if (idx >= 0) {
      activeBrowsers.splice(idx, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// BrowserContext
// ---------------------------------------------------------------------------

export class BrowserContext {
  browser: Browser;
  contextId: string;

  constructor(browser: Browser, contextId: string) {
    this.browser = browser;
    this.contextId = contextId;
  }

  newPage(): Page {
    // Delegate to browser's newPage — context isolation is limited
    // with the bridge approach since sessions don't persist
    return this.browser.newPage();
  }

  cookies(): string {
    return this.browser.cdp.networkGetCookies([]);
  }

  clearCookies(): void {
    this.browser.cdp.networkClearBrowserCookies();
  }

  close(): void {
    if (this.contextId !== "") {
      this.browser.disposeContext(this.contextId);
    }
  }
}

// Standalone launch function — jsc does not emit static methods
export function launchBrowser(config: LaunchConfig): Browser {
  let bp: BrowserProcess = launchBrowserProcess(config);
  let wsUrl: string = waitForDebugger(bp.port, config.timeout);
  if (wsUrl === "") {
    bp.kill();
    throw new Error("Chrome debugger did not respond within " + config.timeout + "ms on port " + bp.port);
  }

  // Native (jsc): direct WebSocket to Chrome — zero bridge processes
  let cdp: CdpClient = CdpClient.connectDirect(wsUrl, "", config.timeout);
  return new Browser(cdp, bp, config);
}
