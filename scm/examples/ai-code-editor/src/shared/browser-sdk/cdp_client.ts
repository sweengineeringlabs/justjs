// CDP Client — sends CDP commands to Chrome via native WebSocket FFI.
//
// Two modes:
// 1. Native (jsc): direct WebSocket via jst_ws_* FFI — zero bridge processes
// 2. Persistent: single WebSocket via TCP relay (for subprocess-based automation)
//
// Mode 1 is active when wsHandle != 0 (set by connectDirect).
// Mode 2 is active when bridgePort > 0 (set by createPersistent).

// jst_ws_* FFI — provided by the jsc native runtime.
import { spawn, ChildProcess, spawnSync } from "child_process";

/// Binary for spawning CDP bridge/relay scripts.
/// Default to jsc — the native runtime.
export const BRIDGE_BIN: string = "jsc";

/// Shared sleep buffer — allocated once, reused for all synchronous delays.
const SLEEP_BUF: Int32Array = new Int32Array(new SharedArrayBuffer(4));

/// Synchronous sleep without CPU spin or process spawn.
export function sleepMs(ms: number): void {
  Atomics.wait(SLEEP_BUF, 0, 0, ms);
}

import {
  BoundingBox, NavigateResult, RemoteObject,
  SCREENSHOT_PNG, CdpEvent,
} from "./types";
import { BrowserError, browserError, ERR_CDP, ERR_JAVASCRIPT } from "./error";

// ---------------------------------------------------------------------------
// Native FFI boundary — jst_ws_* injected by Cranelift at compile time.
// Exported module-level wrappers keep usage visible to the linter and
// provide a typed call boundary.
// ---------------------------------------------------------------------------

export function nativeWsConnect(url: string, timeoutMs: number): number {
  const h: number = (jst_ws_connect as any)(url, timeoutMs);
  return h;
}
export function nativeWsSendRecv(handle: number, json: string, timeoutMs: number): string {
  const r: string = (jst_ws_send_recv as any)(handle, json, timeoutMs);
  return r;
}
export function nativeWsGetEvents(handle: number): string {
  const r: string = (jst_ws_get_events as any)(handle);
  return r;
}
export function nativeWsClose(handle: number): void {
  (jst_ws_close as any)(handle);
}

// ---------------------------------------------------------------------------
// CdpClient
// ---------------------------------------------------------------------------

export class CdpClient {
  wsUrl: string;
  bridgeScript: string;
  sessionId: string;
  lastError: string;
  // Native FFI fields (mode 1)
  wsHandle: number;
  timeoutMs: number;
  // Persistent bridge fields (mode 2)
  bridgeProcess: ChildProcess | null;
  bridgePort: number;
  relayScript: string;

  constructor(wsUrl: string, bridgeScript: string, sessionId: string) {
    this.wsUrl = wsUrl;
    this.bridgeScript = bridgeScript;
    this.sessionId = sessionId;
    this.lastError = "";
    this.wsHandle = 0;
    this.timeoutMs = 15000;
    this.bridgeProcess = null;
    this.bridgePort = 0;
    this.relayScript = "";
  }

  // -----------------------------------------------------------------------
  // Persistent bridge factory
  // -----------------------------------------------------------------------

  static createPersistent(
    wsUrl: string, persistentBridgeScript: string,
    relayScript: string, sessionId: string,
    port: number
  ): CdpClient {
    let client: CdpClient = new CdpClient(wsUrl, persistentBridgeScript, sessionId);
    client.relayScript = relayScript;
    client.bridgePort = port;

    // Spawn persistent bridge process
    client.bridgeProcess = spawn(BRIDGE_BIN, [persistentBridgeScript, wsUrl, String(port)], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Wait for bridge to be ready by polling the TCP port
    let start: number = Date.now();
    let ready: boolean = false;
    while (Date.now() - start < 10000) {
      try {
        let result = spawnSync(BRIDGE_BIN, [relayScript, String(port), '{"method":"__getEvents"}'], {
          encoding: "utf-8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"],
        });
        if (result.status === 0 && result.stdout.trim().length > 0) {
          ready = true;
          break;
        }
      } catch (_e) {
        // not ready yet
      }
      sleepMs(200);
    }

    if (!ready) {
      try { client.bridgeProcess.kill(); } catch (_e) { /* ignore */ }
      throw new Error("Persistent bridge did not start within 10s on port " + port);
    }

    return client;
  }

  // -----------------------------------------------------------------------
  // Native FFI factory (jsc-compiled TypeScript only)
  // -----------------------------------------------------------------------

  static connectDirect(wsUrl: string, sessionId: string, timeoutMs: number): CdpClient {
    let client: CdpClient = new CdpClient(wsUrl, "", sessionId);
    client.timeoutMs = timeoutMs;
    client.wsHandle = nativeWsConnect(wsUrl, timeoutMs);
    if (client.wsHandle < 0) {
      throw new Error("WebSocket connect failed: " + wsUrl);
    }
    return client;
  }

  isNative(): boolean {
    return this.wsHandle !== 0;
  }

  isPersistent(): boolean {
    return this.bridgePort > 0 && this.relayScript !== "";
  }

  // Send command through relay without shell escaping issues
  private sendViaRelay(cmdStr: string): string {
    let result: any = spawnSync(
      BRIDGE_BIN, [this.relayScript, String(this.bridgePort), cmdStr],
      { encoding: "utf-8", timeout: 15000, stdio: ["pipe", "pipe", "pipe"] }
    );
    if (result.status !== 0) {
      this.lastError = (result.stderr || "relay failed").trim();
      return "";
    }
    return (result.stdout || "").trim();
  }

  // -----------------------------------------------------------------------
  // Low-level CDP send
  // -----------------------------------------------------------------------

  /// Build a CDP command JSON string. Accepts params as a pre-built JSON string
  /// (e.g. '{"url":"about:blank"}') or empty string for no params.
  sendJson(method: string, paramsJson: string): string {
    this.lastError = "";
    let cmdStr: string = '{"method":"' + method + '"';
    if (paramsJson !== "") {
      cmdStr = cmdStr + ',"params":' + paramsJson;
    } else {
      cmdStr = cmdStr + ',"params":{}';
    }
    if (this.sessionId !== "") {
      cmdStr = cmdStr + ',"sessionId":"' + this.sessionId + '"';
    }
    cmdStr = cmdStr + '}';
    return this.sendRawCmd(cmdStr);
  }

  /// Deprecated: callers should use sendJson() directly with pre-built JSON param strings.
  /// This method exists only as a fallback — it drops all params (JIT can't serialize objects).
  send(method: string, params: any): string {
    // Delegate to sendJson with empty params — object serialization not supported by JIT.
    return this.sendJson(method, "");
  }

  /// Send a pre-built CDP command JSON string and return the raw response.
  sendRawCmd(cmdStr: string): string {
    this.lastError = "";
    try {
      let raw: string = "";

      if (this.isNative()) {
        raw = nativeWsSendRecv(this.wsHandle, cmdStr, this.timeoutMs);
        if (raw.length === 0) {
          this.lastError = "CDP send_recv timed out or failed";
          return "";
        }
      } else if (this.isPersistent()) {
        raw = this.sendViaRelay(cmdStr);
        if (this.lastError !== "") return "";
      } else {
        this.lastError = "CdpClient: not connected";
        return "";
      }
      return raw.trim();
    } catch (_e) {
      this.lastError = "CDP send failed";
      return "";
    }
  }

  // -----------------------------------------------------------------------
  // Runtime.evaluate (convenience — returns unwrapped value)
  // -----------------------------------------------------------------------

  evaluate(js: string): string {
    this.lastError = "";
    let escaped: string = js.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let paramsJson: string = '{"expression":"' + escaped + '","returnByValue":true,"awaitPromise":false}';
    let raw: string = this.sendJson("Runtime.evaluate", paramsJson);
    if (raw.length === 0) return "";

    // Extract value from CDP response via string search (indexOf only — no lastIndexOf)
    // Response: {"id":N,"result":{"result":{"type":"number","value":3,"description":"3"}}}
    let errorIdx: number = raw.indexOf('"error"');
    if (errorIdx >= 0) {
      this.lastError = "CDP error";
      return "";
    }

    // Find "value": after the inner "result" block
    let valueKey: number = raw.indexOf('"value"');
    if (valueKey < 0) {
      // No value field — check for "type":"undefined"
      if (raw.indexOf('"undefined"') >= 0) return "";
      return "";
    }
    let colonIdx: number = raw.indexOf(':', valueKey + 7);
    if (colonIdx < 0) return "";
    let afterColon: string = raw.substring(colonIdx + 1).trim();

    if (afterColon.indexOf('"') === 0) {
      // String value: extract between quotes
      let vEnd: number = afterColon.indexOf('"', 1);
      if (vEnd < 0) return afterColon;
      return afterColon.substring(1, vEnd);
    }
    // Number/boolean: read until comma, brace, or end
    let end: number = 0;
    while (end < afterColon.length) {
      let ch: string = afterColon.charAt(end);
      if (ch === "," || ch === "}" || ch === "]") break;
      end = end + 1;
    }
    return afterColon.substring(0, end).trim();
  }

  evaluateError(): string {
    return this.lastError;
  }

  // -----------------------------------------------------------------------
  // Event subscription (persistent mode only)
  // -----------------------------------------------------------------------

  getEvents(): CdpEvent[] {
    this.lastError = "";
    let rawResult: string;

    if (this.isNative()) {
      // jst_ws_get_events returns a JSON array: [{method, params, sessionId}, ...]
      rawResult = nativeWsGetEvents(this.wsHandle);
      if (rawResult.length === 0) return [];
      try {
        let rawEvents: any[] = JSON.parse(rawResult);
        let events: CdpEvent[] = [];
        let i: number = 0;
        while (i < rawEvents.length) {
          events.push(new CdpEvent(
            rawEvents[i].method || "",
            rawEvents[i].params || {},
            rawEvents[i].sessionId || ""
          ));
          i = i + 1;
        }
        return events;
      } catch (_e) {
        return [];
      }
    }

    if (!this.isPersistent()) return [];
    // Persistent bridge returns {events: [...]}
    rawResult = this.sendViaRelay('{"method":"__getEvents"}');
    if (rawResult.length === 0) return [];
    try {
      let parsed = JSON.parse(rawResult);
      let events: CdpEvent[] = [];
      let rawEvents: any[] = parsed.events || [];
      let i: number = 0;
      while (i < rawEvents.length) {
        events.push(new CdpEvent(
          rawEvents[i].method || "",
          rawEvents[i].params || {},
          rawEvents[i].sessionId || ""
        ));
        i = i + 1;
      }
      return events;
    } catch (_e) {
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Bridge lifecycle
  // -----------------------------------------------------------------------

  closeBridge(): void {
    if (this.isNative()) {
      try { nativeWsClose(this.wsHandle); } catch (_e) { /* ignore */ }
      this.wsHandle = 0;
      return;
    }
    if (this.isPersistent()) {
      try {
        this.sendViaRelay('{"method":"__close"}');
      } catch (_e) { /* ignore */ }
    }
    if (this.bridgeProcess !== null) {
      try { this.bridgeProcess.kill(); } catch (_e) { /* ignore */ }
    }
  }

  // -----------------------------------------------------------------------
  // Session-scoped client
  // -----------------------------------------------------------------------

  withSession(sessionId: string): CdpClient {
    let client: CdpClient = new CdpClient(this.wsUrl, this.bridgeScript, sessionId);
    if (this.isNative()) {
      // Sessions are multiplexed on a single WS connection via CDP sessionId field.
      // Share the handle; sessionId is injected into each command JSON by TypeScript.
      client.wsHandle = this.wsHandle;
      client.timeoutMs = this.timeoutMs;
    } else {
      // Share persistent bridge
      client.bridgeProcess = this.bridgeProcess;
      client.bridgePort = this.bridgePort;
      client.relayScript = this.relayScript;
    }
    return client;
  }

  // -----------------------------------------------------------------------
  // Target domain
  // -----------------------------------------------------------------------

  targetCreateTarget(url: string): string {
    let result: string = this.sendJson("Target.createTarget", '{"url":"' + url + '"}');
    if (result === "") return "";
    // Extract targetId from: ..."targetId":"<value>"...
    let idx: number = result.indexOf('"targetId"');
    if (idx < 0) return "";
    let colon: number = result.indexOf(':', idx + 10);
    if (colon < 0) return "";
    let qStart: number = result.indexOf('"', colon + 1);
    if (qStart < 0) return "";
    let qEnd: number = result.indexOf('"', qStart + 1);
    if (qEnd < 0) return "";
    return result.substring(qStart + 1, qEnd);
  }

  targetAttachToTarget(targetId: string): string {
    let result: string = this.sendJson("Target.attachToTarget", '{"targetId":"' + targetId + '","flatten":true}');
    if (result === "") return "";
    // Extract sessionId from: ..."sessionId":"<value>"...
    let idx: number = result.indexOf('"sessionId"');
    if (idx < 0) return "";
    let colon: number = result.indexOf(':', idx + 11);
    if (colon < 0) return "";
    let qStart: number = result.indexOf('"', colon + 1);
    if (qStart < 0) return "";
    let qEnd: number = result.indexOf('"', qStart + 1);
    if (qEnd < 0) return "";
    return result.substring(qStart + 1, qEnd);
  }

  targetCloseTarget(targetId: string): boolean {
    let result: string = this.sendJson("Target.closeTarget", '{"targetId":"' + targetId + '"}');
    return result !== "";
  }

  targetGetTargets(): string {
    let result: string = this.sendJson("Target.getTargets", "");
    if (result === "") return "[]";
    return result;
  }

  // -----------------------------------------------------------------------
  // Page domain
  // -----------------------------------------------------------------------

  pageEnable(): void {
    this.sendJson("Page.enable", "");
  }

  pageNavigate(url: string): NavigateResult {
    let result: string = this.sendJson("Page.navigate", '{"url":"' + url + '"}');
    if (result === "") return new NavigateResult("", "", this.lastError || "navigation failed");
    // Check for errorText
    if (result.indexOf('"errorText"') >= 0) {
      let eIdx: number = result.indexOf('"errorText"');
      let eColon: number = result.indexOf(':', eIdx + 11);
      let eqStart: number = result.indexOf('"', eColon + 1);
      let eqEnd: number = result.indexOf('"', eqStart + 1);
      let errorText: string = (eqStart >= 0 && eqEnd >= 0) ? result.substring(eqStart + 1, eqEnd) : "";
      return new NavigateResult("", "", errorText);
    }
    // Extract frameId
    let frameId: string = this.extractStringField(result, "frameId");
    let loaderId: string = this.extractStringField(result, "loaderId");
    return new NavigateResult(frameId, loaderId, "");
  }

  pageReload(ignoreCache: boolean): void {
    this.sendJson("Page.reload", '{"ignoreCache":' + ignoreCache + '}');
  }

  pageScreenshot(format: string, quality: number): string {
    let paramsJson: string;
    if (format === "jpeg" || format === "webp") {
      paramsJson = '{"format":"' + format + '","quality":' + quality + '}';
    } else {
      paramsJson = '{"format":"' + format + '"}';
    }
    let result: string = this.sendJson("Page.captureScreenshot", paramsJson);
    if (result === "") return "";
    return this.extractStringField(result, "data");
  }

  pageGetNavigationHistory(): string {
    return this.sendJson("Page.getNavigationHistory", "");
  }

  pageNavigateToHistoryEntry(entryId: number): void {
    this.sendJson("Page.navigateToHistoryEntry", '{"entryId":' + entryId + '}');
  }

  // -----------------------------------------------------------------------
  // Runtime domain
  // -----------------------------------------------------------------------

  runtimeEnable(): void {
    this.sendJson("Runtime.enable", "");
  }

  runtimeEvaluate(expression: string): string {
    let escaped: string = expression.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return this.sendJson("Runtime.evaluate", '{"expression":"' + escaped + '","returnByValue":true,"awaitPromise":false}');
  }

  runtimeCallFunctionOn(objectId: string, functionDecl: string): string {
    let escapedDecl: string = functionDecl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return this.sendJson("Runtime.callFunctionOn", '{"objectId":"' + objectId + '","functionDeclaration":"' + escapedDecl + '","returnByValue":true}');
  }

  // -----------------------------------------------------------------------
  // DOM domain
  // -----------------------------------------------------------------------

  domEnable(): void {
    this.sendJson("DOM.enable", "");
  }

  domGetDocument(): number {
    let result: string = this.sendJson("DOM.getDocument", '{"depth":0}');
    if (result === "") return 0;
    // Extract root.nodeId — look for "nodeId": after "root"
    let rootIdx: number = result.indexOf('"root"');
    if (rootIdx < 0) return 0;
    let nodeIdIdx: number = result.indexOf('"nodeId"', rootIdx);
    if (nodeIdIdx < 0) return 0;
    let colon: number = result.indexOf(':', nodeIdIdx + 8);
    if (colon < 0) return 0;
    return this.extractNumberAfterColon(result, colon);
  }

  domQuerySelector(nodeId: number, selector: string): number {
    let escapedSel: string = selector.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let result: string = this.sendJson("DOM.querySelector", '{"nodeId":' + nodeId + ',"selector":"' + escapedSel + '"}');
    if (result === "") return 0;
    let idx: number = result.indexOf('"nodeId"');
    if (idx < 0) return 0;
    let colon: number = result.indexOf(':', idx + 8);
    if (colon < 0) return 0;
    return this.extractNumberAfterColon(result, colon);
  }

  domQuerySelectorAll(nodeId: number, selector: string): string {
    let escapedSel: string = selector.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let result: string = this.sendJson("DOM.querySelectorAll", '{"nodeId":' + nodeId + ',"selector":"' + escapedSel + '"}');
    if (result === "") return "[]";
    return result;
  }

  domResolveNode(nodeId: number): string {
    let result: string = this.sendJson("DOM.resolveNode", '{"nodeId":' + nodeId + '}');
    if (result === "") return "";
    return result;
  }

  domGetBoxModel(nodeId: number): string {
    let result: string = this.sendJson("DOM.getBoxModel", '{"nodeId":' + nodeId + '}');
    if (result === "") return "";
    return result;
  }

  // -----------------------------------------------------------------------
  // Input domain
  // -----------------------------------------------------------------------

  inputDispatchMouseEvent(
    eventType: string, x: number, y: number,
    button: string, clickCount: number, modifiers: number
  ): void {
    this.sendJson("Input.dispatchMouseEvent",
      '{"type":"' + eventType + '","x":' + x + ',"y":' + y +
      ',"button":"' + button + '","clickCount":' + clickCount +
      ',"modifiers":' + modifiers + '}');
  }

  inputDispatchKeyEvent(
    eventType: string, key: string, text: string, modifiers: number
  ): void {
    let escapedKey: string = key.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let escapedText: string = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    this.sendJson("Input.dispatchKeyEvent",
      '{"type":"' + eventType + '","key":"' + escapedKey +
      '","text":"' + escapedText + '","modifiers":' + modifiers + '}');
  }

  inputInsertText(text: string): void {
    let escapedText: string = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    this.sendJson("Input.insertText", '{"text":"' + escapedText + '"}');
  }

  // -----------------------------------------------------------------------
  // Network domain
  // -----------------------------------------------------------------------

  networkEnable(): void {
    this.sendJson("Network.enable", "");
  }

  networkGetCookies(urls: string[]): string {
    // Build JSON array of urls
    let urlsJson: string = "[";
    let ui: number = 0;
    while (ui < urls.length) {
      if (ui > 0) urlsJson = urlsJson + ",";
      urlsJson = urlsJson + '"' + urls[ui] + '"';
      ui = ui + 1;
    }
    urlsJson = urlsJson + "]";
    let result: string = this.sendJson("Network.getCookies", '{"urls":' + urlsJson + '}');
    if (result === "") return "[]";
    return result;
  }

  networkSetCookie(cookieJson: string): boolean {
    let result: string = this.sendJson("Network.setCookie", cookieJson);
    return result !== "";
  }

  networkClearBrowserCookies(): void {
    this.sendJson("Network.clearBrowserCookies", "");
  }

  networkEmulateConditions(offline: boolean, latency: number): void {
    this.sendJson("Network.emulateNetworkConditions",
      '{"offline":' + offline + ',"latency":' + latency +
      ',"downloadThroughput":-1,"uploadThroughput":-1}');
  }

  // -----------------------------------------------------------------------
  // Fetch domain
  // -----------------------------------------------------------------------

  fetchEnable(patternsJson: string): void {
    this.sendJson("Fetch.enable", '{"patterns":' + patternsJson + ',"handleAuthRequests":false}');
  }

  fetchDisable(): void {
    this.sendJson("Fetch.disable", "");
  }

  fetchContinueRequest(requestId: string, url: string, method: string, headersJson: string): void {
    let paramsJson: string = '{"requestId":"' + requestId + '"';
    if (url !== "") paramsJson = paramsJson + ',"url":"' + url + '"';
    if (method !== "") paramsJson = paramsJson + ',"method":"' + method + '"';
    if (headersJson !== "" && headersJson !== "[]") paramsJson = paramsJson + ',"headers":' + headersJson;
    paramsJson = paramsJson + '}';
    this.sendJson("Fetch.continueRequest", paramsJson);
  }

  fetchFailRequest(requestId: string, reason: string): void {
    this.sendJson("Fetch.failRequest", '{"requestId":"' + requestId + '","errorReason":"' + reason + '"}');
  }

  fetchFulfillRequest(requestId: string, status: number, headersJson: string, body: string): void {
    let escapedBody: string = body.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    this.sendJson("Fetch.fulfillRequest",
      '{"requestId":"' + requestId + '","responseCode":' + status +
      ',"responseHeaders":' + headersJson + ',"body":"' + escapedBody + '"}');
  }

  // -----------------------------------------------------------------------
  // Emulation domain
  // -----------------------------------------------------------------------

  emulationSetDeviceMetrics(width: number, height: number, scale: number, mobile: boolean): void {
    this.sendJson("Emulation.setDeviceMetricsOverride",
      '{"width":' + width + ',"height":' + height +
      ',"deviceScaleFactor":' + scale + ',"mobile":' + mobile + '}');
  }

  emulationClearDeviceMetrics(): void {
    this.sendJson("Emulation.clearDeviceMetricsOverride", "");
  }

  emulationSetEmulatedMedia(featuresJson: string): void {
    this.sendJson("Emulation.setEmulatedMedia", '{"features":' + featuresJson + '}');
  }

  // -----------------------------------------------------------------------
  // JSON string field extraction helpers
  // -----------------------------------------------------------------------

  extractStringField(json: string, field: string): string {
    let key: string = '"' + field + '"';
    let idx: number = json.indexOf(key);
    if (idx < 0) return "";
    let colon: number = json.indexOf(':', idx + key.length);
    if (colon < 0) return "";
    let qStart: number = json.indexOf('"', colon + 1);
    if (qStart < 0) return "";
    let qEnd: number = json.indexOf('"', qStart + 1);
    if (qEnd < 0) return "";
    return json.substring(qStart + 1, qEnd);
  }

  extractNumberAfterColon(json: string, colonIdx: number): number {
    let afterColon: string = json.substring(colonIdx + 1).trim();
    let end: number = 0;
    while (end < afterColon.length) {
      let ch: string = afterColon.charAt(end);
      if (ch === "," || ch === "}" || ch === "]" || ch === " ") break;
      end = end + 1;
    }
    let numStr: string = afterColon.substring(0, end);
    let val: number = parseInt(numStr, 10);
    if (isNaN(val)) return 0;
    return val;
  }

  // -----------------------------------------------------------------------
  // Convenience helpers
  // -----------------------------------------------------------------------

  getComputedStyle(selector: string, property: string): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(selector) + "');" +
      "if (!el) return '__NOT_FOUND__';" +
      "return window.getComputedStyle(el).getPropertyValue('" + escapeForJs(property) + "');" +
      "})()";
    let result: string = this.evaluate(js);
    if (result === "__NOT_FOUND__") {
      this.lastError = "element not found: " + selector;
      return "";
    }
    return result;
  }

  getBoundingRect(selector: string): BoundingBox {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(selector) + "');" +
      "if (!el) return '__NOT_FOUND__';" +
      "var r = el.getBoundingClientRect();" +
      "return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height });" +
      "})()";
    let result: string = this.evaluate(js);
    if (result === "__NOT_FOUND__") {
      this.lastError = "element not found: " + selector;
      return new BoundingBox(0, 0, 0, 0);
    }
    try {
      let parsed = JSON.parse(result);
      return new BoundingBox(parsed.x || 0, parsed.y || 0, parsed.width || 0, parsed.height || 0);
    } catch (_e) {
      this.lastError = "failed to parse bounding rect";
      return new BoundingBox(0, 0, 0, 0);
    }
  }

  setViewportSize(width: number, height: number): void {
    this.emulationSetDeviceMetrics(width, height, 1.0, false);
  }

  getViewportSize(): number[] {
    let js: string = "JSON.stringify({ w: window.innerWidth, h: window.innerHeight })";
    let result: string = this.evaluate(js);
    if (this.lastError !== "") return [0, 0];
    try {
      let parsed = JSON.parse(result);
      return [parsed.w || 0, parsed.h || 0];
    } catch (_e) {
      return [0, 0];
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function escapeForJs(s: string): string {
  let result: string = "";
  let i: number = 0;
  while (i < s.length) {
    let ch: string = s[i];
    if (ch === "\\") result = result + "\\\\";
    else if (ch === "'") result = result + "\\'";
    else if (ch === "\"") result = result + "\\\"";
    else result = result + ch;
    i = i + 1;
  }
  return result;
}
