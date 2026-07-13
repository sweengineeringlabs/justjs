// Page — page interaction API. Ported from Rust page.rs.
// Node-only (uses CdpClient).

import { execSync, spawnSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { CdpClient, escapeForJs } from "./cdp_client";
import { Element } from "./element";
import {
  BoundingBox, Viewport, NavigateResult, SCREENSHOT_PNG,
  Dialog, ConsoleMessage, PageError,
  Har, HarEntry, HarRequest, HarResponse, HarHeader, HarContent, HarTimings,
  WebSocketInfo, WebSocketFrame, WS_SENT, WS_RECEIVED,
  ServiceWorker, WebWorker, WORKER_DEDICATED, WORKER_SHARED,
  TracingOptions, TraceData, TraceEvent,
  VideoRecordingOptions, ScreencastFrame,
  DatabaseInfo, ObjectStoreInfo, DataEntry,
} from "./types";
import { encodeAviMjpeg, readJpegDimensions, VideoResult, AviStreamWriter } from "./video_encoder";

// ---------------------------------------------------------------------------
// Page class
// ---------------------------------------------------------------------------

export class Page {
  cdp: CdpClient;
  targetId: string;
  sessionId: string;
  viewport: Viewport;
  timeout: number;
  slowMo: number;
  port: number;

  constructor(
    cdp: CdpClient, targetId: string, sessionId: string,
    viewport: Viewport, timeout: number, slowMo: number
  ) {
    this.cdp = cdp;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.viewport = viewport;
    this.timeout = timeout;
    this.slowMo = slowMo;
    this.port = 0;
    // Extract port from WS URL
    try {
      let wsUrl: string = cdp.wsUrl;
      let portMatch: string = wsUrl.substring(wsUrl.indexOf("://") + 3);
      let colonIdx: number = portMatch.indexOf(":");
      if (colonIdx >= 0) {
        let afterColon: string = portMatch.substring(colonIdx + 1);
        let slashIdx: number = afterColon.indexOf("/");
        let portStr: string = slashIdx >= 0 ? afterColon.substring(0, slashIdx) : afterColon;
        this.port = parseInt(portStr, 10) || 0;
      }
    } catch (_e) { /* ignore */ }
  }

  private refetchWsUrl(): string {
    let url: string = "http://localhost:" + this.port + "/json";
    try {
      let result = spawnSync("curl", ["-s", "--max-time", "2", url], {
        encoding: "utf-8",
        timeout: 5000,
      });
      if (result.status !== 0) return "";
      let targets = JSON.parse(result.stdout);
      let i: number = 0;
      while (i < targets.length) {
        if (targets[i].type === "page" && targets[i].webSocketDebuggerUrl) {
          return targets[i].webSocketDebuggerUrl;
        }
        i = i + 1;
      }
    } catch (_e) { /* ignore */ }
    return "";
  }

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  goto(url: string): string {
    // Use Page.navigate CDP command — works reliably with sessionless bridge
    let result: string = this.cdp.sendJson("Page.navigate", '{"url":"' + url + '"}');
    if (result === "") return this.cdp.lastError || "navigation failed";
    if (result.indexOf('"errorText"') >= 0) {
      return this.cdp.extractStringField(result, "errorText");
    }

    // Wait for page to load
    this.sleepMs(500);
    return "";
  }

  reload(): string {
    this.cdp.pageReload(false);
    this.sleepMs(300);
    return this.cdp.lastError;
  }

  goBack(): string {
    let historyJson: string = this.cdp.pageGetNavigationHistory();
    if (historyJson === "") return this.cdp.lastError;
    try {
      let history = JSON.parse(historyJson);
      let result = history.result || history;
      let idx: number = result.currentIndex || 0;
      if (idx <= 0) return "no previous page";
      let entries: any[] = result.entries || [];
      if (idx - 1 < entries.length) {
        this.cdp.pageNavigateToHistoryEntry(entries[idx - 1].id);
        this.sleepMs(300);
      }
    } catch (_e) {
      return "failed to parse navigation history";
    }
    return this.cdp.lastError;
  }

  goForward(): string {
    let historyJson: string = this.cdp.pageGetNavigationHistory();
    if (historyJson === "") return this.cdp.lastError;
    try {
      let history = JSON.parse(historyJson);
      let result = history.result || history;
      let idx: number = result.currentIndex || 0;
      let entries: any[] = result.entries || [];
      if (idx + 1 >= entries.length) return "no next page";
      this.cdp.pageNavigateToHistoryEntry(entries[idx + 1].id);
      this.sleepMs(300);
    } catch (_e) {
      return "failed to parse navigation history";
    }
    return this.cdp.lastError;
  }

  url(): string {
    return this.cdp.evaluate("window.location.href");
  }

  title(): string {
    return this.cdp.evaluate("document.title");
  }

  content(): string {
    return this.cdp.evaluate("document.documentElement.outerHTML");
  }

  // -----------------------------------------------------------------------
  // Waiting
  // -----------------------------------------------------------------------

  waitForSelector(selector: string): Element {
    return this.waitForSelectorWithTimeout(selector, this.timeout);
  }

  waitForSelectorWithTimeout(selector: string, timeoutMs: number): Element {
    let start: number = Date.now();
    while (Date.now() - start < timeoutMs) {
      let el = this.querySelector(selector);
      if (el !== null) return el;
      this.sleepMs(100);
    }
    this.cdp.lastError = "timeout waiting for selector: " + selector;
    return new Element(this.cdp, 0, "", selector);
  }

  waitForNavigation(): string {
    this.sleepMs(500);
    return "";
  }

  waitForTimeout(ms: number): void {
    this.sleepMs(ms);
  }

  waitForFunction(expression: string): string {
    return this.waitForFunctionWithTimeout(expression, this.timeout);
  }

  waitForFunctionWithTimeout(expression: string, timeoutMs: number): string {
    let start: number = Date.now();
    while (Date.now() - start < timeoutMs) {
      let result: string = this.cdp.evaluate(expression);
      if (result !== "" && result !== "false" && result !== "null" && result !== "undefined") {
        return result;
      }
      this.sleepMs(100);
    }
    return "";
  }

  // -----------------------------------------------------------------------
  // Querying
  // -----------------------------------------------------------------------

  querySelector(selector: string): Element | null {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(selector) + "');" +
      "return el ? 'found' : 'null';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "found") {
      return new Element(this.cdp, 0, "", selector);
    }
    return null;
  }

  querySelectorAll(selector: string): Element[] {
    let js: string =
      "(function() {" +
      "return document.querySelectorAll('" + escapeForJs(selector) + "').length;" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    let count: number = parseInt(result, 10);
    if (isNaN(count) || count === 0) return [];

    let elements: Element[] = [];
    let i: number = 0;
    while (i < count) {
      let nthSelector: string = selector + ":nth-of-type(" + (i + 1) + ")";
      elements.push(new Element(this.cdp, 0, "", nthSelector));
      i = i + 1;
    }
    return elements;
  }

  evaluate(expression: string): string {
    return this.cdp.evaluate(expression);
  }

  // -----------------------------------------------------------------------
  // Interaction (convenience — delegates to Element)
  // -----------------------------------------------------------------------

  click(selector: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "element not found: " + selector;
    return el.click();
  }

  dblclick(selector: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "element not found: " + selector;
    return el.dblclick();
  }

  fill(selector: string, value: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "element not found: " + selector;
    return el.fill(value);
  }

  typeText(selector: string, text: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "element not found: " + selector;
    return el.typeText(text);
  }

  press(key: string): string {
    this.cdp.inputDispatchKeyEvent("keyDown", key, key, 0);
    this.cdp.inputDispatchKeyEvent("keyUp", key, "", 0);
    return this.cdp.lastError;
  }

  hover(selector: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "element not found: " + selector;
    return el.hover();
  }

  focus(selector: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "element not found: " + selector;
    return el.focus();
  }

  check(selector: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "element not found: " + selector;
    return el.check();
  }

  uncheck(selector: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "element not found: " + selector;
    return el.uncheck();
  }

  select(selector: string, value: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "element not found: " + selector;
    return el.selectOption(value);
  }

  // -----------------------------------------------------------------------
  // Screenshots
  // -----------------------------------------------------------------------

  screenshot(): string {
    return this.cdp.pageScreenshot(SCREENSHOT_PNG, 0);
  }

  screenshotAsBuffer(): Uint8Array {
    let b64: string = this.screenshot();
    if (b64 === "") return new Uint8Array(0);
    return Uint8Array.from(Buffer.from(b64, "base64"));
  }

  screenshotElement(selector: string): string {
    let el = this.querySelector(selector);
    if (el === null) return "";
    return el.screenshot();
  }

  // -----------------------------------------------------------------------
  // Viewport
  // -----------------------------------------------------------------------

  setViewport(width: number, height: number): string {
    this.cdp.setViewportSize(width, height);
    this.viewport.width = width;
    this.viewport.height = height;
    return this.cdp.lastError;
  }

  getViewportSize(): number[] {
    return this.cdp.getViewportSize();
  }

  // -----------------------------------------------------------------------
  // Computed styles
  // -----------------------------------------------------------------------

  getComputedStyle(selector: string, property: string): string {
    return this.cdp.getComputedStyle(selector, property);
  }

  getBoundingRect(selector: string): BoundingBox {
    return this.cdp.getBoundingRect(selector);
  }

  // -----------------------------------------------------------------------
  // Storage
  // -----------------------------------------------------------------------

  getLocalStorage(key: string): string {
    return this.cdp.evaluate("localStorage.getItem('" + escapeForJs(key) + "')");
  }

  setLocalStorage(key: string, value: string): void {
    this.cdp.evaluate("localStorage.setItem('" + escapeForJs(key) + "', " + JSON.stringify(value) + ")");
  }

  getSessionStorage(key: string): string {
    return this.cdp.evaluate("sessionStorage.getItem('" + escapeForJs(key) + "')");
  }

  setSessionStorage(key: string, value: string): void {
    this.cdp.evaluate("sessionStorage.setItem('" + escapeForJs(key) + "', " + JSON.stringify(value) + ")");
  }

  // -----------------------------------------------------------------------
  // Network
  // -----------------------------------------------------------------------

  setOffline(offline: boolean): void {
    this.cdp.networkEmulateConditions(offline, 0);
  }

  // -----------------------------------------------------------------------
  // Dialog handling
  // -----------------------------------------------------------------------

  acceptDialog(promptText: string): string {
    let paramsJson: string = '{"accept":true';
    if (promptText !== "") {
      let escaped: string = promptText.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      paramsJson = paramsJson + ',"promptText":"' + escaped + '"';
    }
    paramsJson = paramsJson + '}';
    this.cdp.sendJson("Page.handleJavaScriptDialog", paramsJson);
    return this.cdp.lastError;
  }

  dismissDialog(): string {
    this.cdp.sendJson("Page.handleJavaScriptDialog", '{"accept":false}');
    return this.cdp.lastError;
  }

  getDialogMessage(): string {
    // Evaluate to trigger and capture dialog info via JS
    // Note: synchronous bridge cannot listen for events, so dialogs
    // must be handled proactively via accept/dismiss
    return "";
  }

  // -----------------------------------------------------------------------
  // Shadow DOM
  // -----------------------------------------------------------------------

  queryShadow(selector: string): Element | null {
    // Split by ">>>" to pierce shadow boundaries
    let parts: string[] = selector.split(">>>");
    if (parts.length <= 1) {
      return this.querySelector(selector.trim());
    }

    // Build JS that traverses shadow roots
    let js: string = "(function() {";
    js = js + "var el = document.querySelector('" + escapeForJs(parts[0].trim()) + "');";
    js = js + "if (!el) return 'null';";

    let pi: number = 1;
    while (pi < parts.length) {
      js = js + "if (!el.shadowRoot) return 'null';";
      js = js + "el = el.shadowRoot.querySelector('" + escapeForJs(parts[pi].trim()) + "');";
      js = js + "if (!el) return 'null';";
      pi = pi + 1;
    }

    js = js + "return 'found';})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "found") {
      // Return element using a JS-based accessor for subsequent operations
      return new Element(this.cdp, 0, "", selector);
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // HAR recording (synchronous capture via CDP)
  // -----------------------------------------------------------------------

  captureHar(durationMs: number): Har {
    // Enable network tracking
    this.cdp.networkEnable();

    // Collect network entries by polling
    let har: Har = new Har();
    let js: string =
      "(function() {" +
      "if (!window.__harEntries) window.__harEntries = [];" +
      "var po = new PerformanceObserver(function(list) {" +
      "  var entries = list.getEntries();" +
      "  for (var i = 0; i < entries.length; i++) {" +
      "    var e = entries[i];" +
      "    window.__harEntries.push({" +
      "      name: e.name, startTime: e.startTime, duration: e.duration," +
      "      initiatorType: e.initiatorType || '', transferSize: e.transferSize || 0" +
      "    });" +
      "  }" +
      "});" +
      "po.observe({ type: 'resource', buffered: true });" +
      "return 'ok';" +
      "})()";
    this.cdp.evaluate(js);

    // Wait for specified duration
    this.sleepMs(durationMs);

    // Collect entries
    let entriesJson: string = this.cdp.evaluate(
      "JSON.stringify(window.__harEntries || [])"
    );

    try {
      let entries = JSON.parse(entriesJson);
      let i: number = 0;
      while (i < entries.length) {
        let e = entries[i];
        let req: HarRequest = new HarRequest("GET", e.name || "");
        let resp: HarResponse = new HarResponse(200, "OK");
        resp.content = new HarContent(e.transferSize || 0, "", "", "");
        let entry: HarEntry = new HarEntry(
          new Date().toISOString(),
          req, resp
        );
        entry.time = e.duration || 0;
        har.entries.push(entry);
        i = i + 1;
      }
    } catch (_e) { /* ignore parse errors */ }

    return har;
  }

  // -----------------------------------------------------------------------
  // Console messages (synchronous capture)
  // -----------------------------------------------------------------------

  captureConsoleLogs(durationMs: number): ConsoleMessage[] {
    let js: string =
      "(function() {" +
      "if (!window.__consoleLogs) {" +
      "  window.__consoleLogs = [];" +
      "  var orig = console.log;" +
      "  ['log','debug','info','warn','error'].forEach(function(level) {" +
      "    var fn = console[level];" +
      "    console[level] = function() {" +
      "      window.__consoleLogs.push({ level: level, text: Array.prototype.join.call(arguments, ' '), ts: Date.now() });" +
      "      fn.apply(console, arguments);" +
      "    };" +
      "  });" +
      "}" +
      "return 'ok';" +
      "})()";
    this.cdp.evaluate(js);
    this.sleepMs(durationMs);

    let logsJson: string = this.cdp.evaluate("JSON.stringify(window.__consoleLogs || [])");
    let messages: ConsoleMessage[] = [];
    try {
      let logs = JSON.parse(logsJson);
      let i: number = 0;
      while (i < logs.length) {
        messages.push(new ConsoleMessage(logs[i].level || "log", logs[i].text || "", "", logs[i].ts || 0));
        i = i + 1;
      }
    } catch (_e) { /* ignore */ }
    return messages;
  }

  // -----------------------------------------------------------------------
  // Service workers
  // -----------------------------------------------------------------------

  serviceWorkers(): ServiceWorker[] {
    this.cdp.sendJson("ServiceWorker.enable", "");
    let resultJson: string = this.cdp.sendJson("ServiceWorker.getAllRegistrations", "");
    let workers: ServiceWorker[] = [];
    if (resultJson === "") return workers;
    try {
      let parsed = JSON.parse(resultJson);
      let result = parsed.result || parsed;
      let regs: any[] = result.registrations || [];
      let i: number = 0;
      while (i < regs.length) {
        workers.push(new ServiceWorker(
          regs[i].registrationId || "",
          regs[i].scopeURL || "",
          regs[i].isDeleted || false
        ));
        i = i + 1;
      }
    } catch (_e) { /* ignore parse errors */ }
    return workers;
  }

  unregisterServiceWorker(scopeUrl: string): string {
    this.cdp.sendJson("ServiceWorker.unregister", '{"scopeURL":"' + scopeUrl + '"}');
    return this.cdp.lastError;
  }

  stopAllServiceWorkers(): string {
    this.cdp.sendJson("ServiceWorker.stopAllWorkers", "");
    return this.cdp.lastError;
  }

  // -----------------------------------------------------------------------
  // Web workers
  // -----------------------------------------------------------------------

  webWorkers(): WebWorker[] {
    let targetsJson: string = this.cdp.targetGetTargets();
    let workers: WebWorker[] = [];
    try {
      let parsed = JSON.parse(targetsJson);
      let result = parsed.result || parsed;
      let targets: any[] = result.targetInfos || [];
      let i: number = 0;
      while (i < targets.length) {
        let t = targets[i];
        let wType: string = "";
        if (t.type === "worker") wType = WORKER_DEDICATED;
        else if (t.type === "shared_worker") wType = WORKER_SHARED;
        if (wType !== "") {
          workers.push(new WebWorker(t.targetId || "", t.url || "", wType, t.attached || false));
        }
        i = i + 1;
      }
    } catch (_e) { /* ignore */ }
    return workers;
  }

  evaluateInWorker(workerId: string, expression: string): string {
    // Attach to worker target via CDP, but since bridge is sessionless,
    // we use a JS-based approach through the main page
    let js: string = "(function() { return 'worker evaluation not supported in bridge mode'; })()";
    return this.cdp.evaluate(js);
  }

  terminateWorker(workerId: string): string {
    this.cdp.targetCloseTarget(workerId);
    return this.cdp.lastError;
  }

  // -----------------------------------------------------------------------
  // Tracing
  // -----------------------------------------------------------------------

  startTracing(options: TracingOptions): string {
    let categories: string = options.categories;
    if (categories === "") {
      categories = "devtools.timeline,v8,blink";
      if (options.screenshots) categories = categories + ",disabled-by-default-devtools.screenshot";
    }
    this.cdp.sendJson("Tracing.start",
      '{"categories":"' + categories + '","options":"record-until-full"}');
    return this.cdp.lastError;
  }

  stopTracing(): TraceData {
    this.cdp.sendJson("Tracing.end", "");
    // Brief wait for tracing to complete
    this.sleepMs(500);

    // Collect trace data via stream
    let data: TraceData = new TraceData();
    // Note: full streaming requires event subscription which the bridge
    // doesn't support. Return empty trace data — use file-based approach instead.
    return data;
  }

  stopTracingToFile(outputPath: string): string {
    this.cdp.sendJson("Tracing.end", "");
    this.sleepMs(1000);
    // Write placeholder — full trace streaming requires persistent WebSocket
    writeFileSync(outputPath, JSON.stringify({ traceEvents: [] }));
    return outputPath;
  }

  // -----------------------------------------------------------------------
  // Video recording
  // -----------------------------------------------------------------------

  captureScreencastFrames(options: VideoRecordingOptions, durationMs: number): string[] {
    // Capture periodic screenshots as JPEG frames.
    let interval: number = options.fps > 0 ? Math.round(1000 / options.fps) : 200;
    let frames: string[] = [];
    let elapsed: number = 0;

    while (elapsed < durationMs) {
      let b64: string = this.cdp.pageScreenshot(options.format, options.quality);
      if (b64 !== "") frames.push(b64);
      this.sleepMs(interval);
      elapsed = elapsed + interval;
    }

    // Save individual frames to disk if path is set
    if (options.path !== "") {
      if (!existsSync(options.path)) mkdirSync(options.path, { recursive: true });
      let fi: number = 0;
      while (fi < frames.length) {
        let framePath: string = join(options.path, "frame-" + String(fi).padStart(4, "0") + "." + options.format);
        writeFileSync(framePath, Buffer.from(frames[fi], "base64"));
        fi = fi + 1;
      }
    }

    return frames;
  }

  recordVideo(outputPath: string, durationMs: number): VideoResult {
    return this.recordVideoWithOptions(outputPath, durationMs, 5, 80, 0);
  }

  recordVideoWithOptions(outputPath: string, durationMs: number, fps: number, quality: number, maxFrames: number): VideoResult {
    // Streaming mode: write frames to disk as captured, minimal memory usage.
    let interval: number = Math.round(1000 / fps);
    let elapsed: number = 0;
    let writer: AviStreamWriter | null = null;
    let width: number = this.viewport.width;
    let height: number = this.viewport.height;

    while (elapsed < durationMs) {
      let b64: string = this.cdp.pageScreenshot("jpeg", quality);
      if (b64 !== "") {
        let frame: Uint8Array = Uint8Array.from(Buffer.from(b64, "base64"));

        if (writer === null) {
          // First frame — read dimensions and create stream writer
          let dims: number[] = readJpegDimensions(frame);
          if (dims[0] > 0) width = dims[0];
          if (dims[1] > 0) height = dims[1];
          writer = new AviStreamWriter(outputPath, width, height, fps, maxFrames);
        }

        let added: boolean = writer.addFrame(frame);
        if (!added) break; // maxFrames reached
      }
      this.sleepMs(interval);
      elapsed = elapsed + interval;
    }

    if (writer === null) {
      return new VideoResult(outputPath, 0, 0, 0, fps, 0, 0);
    }

    return writer.finish();
  }

  // -----------------------------------------------------------------------
  // IndexedDB
  // -----------------------------------------------------------------------

  listDatabases(securityOrigin: string): DatabaseInfo[] {
    let resultJson: string = this.cdp.sendJson("IndexedDB.requestDatabaseNames",
      '{"securityOrigin":"' + securityOrigin + '"}');
    let dbs: DatabaseInfo[] = [];
    if (resultJson === "") return dbs;
    try {
      let parsed = JSON.parse(resultJson);
      let result = parsed.result || parsed;
      let names: string[] = result.databaseNames || [];
      let i: number = 0;
      while (i < names.length) {
        dbs.push(new DatabaseInfo(names[i], 0));
        i = i + 1;
      }
    } catch (_e) { /* ignore */ }
    return dbs;
  }

  listObjectStores(securityOrigin: string, dbName: string): ObjectStoreInfo[] {
    let escapedDb: string = dbName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let resultJson: string = this.cdp.sendJson("IndexedDB.requestDatabase",
      '{"securityOrigin":"' + securityOrigin + '","databaseName":"' + escapedDb + '"}');
    let stores: ObjectStoreInfo[] = [];
    if (resultJson === "") return stores;
    try {
      let parsed = JSON.parse(resultJson);
      let result = parsed.result || parsed;
      let db = result.databaseWithObjectStores;
      if (!db) return stores;
      let os: any[] = db.objectStores || [];
      let i: number = 0;
      while (i < os.length) {
        let keyPath: string = "";
        if (os[i].keyPath && os[i].keyPath.string) keyPath = os[i].keyPath.string;
        stores.push(new ObjectStoreInfo(os[i].name || "", keyPath, os[i].autoIncrement || false));
        i = i + 1;
      }
    } catch (_e) { /* ignore */ }
    return stores;
  }

  readObjectStore(securityOrigin: string, dbName: string, storeName: string, count: number): DataEntry[] {
    let escapedDb: string = dbName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let escapedStore: string = storeName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let resultJson: string = this.cdp.sendJson("IndexedDB.requestData",
      '{"securityOrigin":"' + securityOrigin + '","databaseName":"' + escapedDb +
      '","objectStoreName":"' + escapedStore + '","indexName":"","skipCount":0,"pageSize":' + count + '}');
    let entries: DataEntry[] = [];
    if (resultJson === "") return entries;
    try {
      let parsed = JSON.parse(resultJson);
      let result = parsed.result || parsed;
      let items: any[] = result.objectStoreDataEntries || [];
      let i: number = 0;
      while (i < items.length) {
        let keyVal: any = null;
        let pkVal: any = null;
        let valVal: any = null;
        if (items[i].key) keyVal = items[i].key.value;
        if (items[i].primaryKey) pkVal = items[i].primaryKey.value;
        if (items[i].value) valVal = items[i].value.value;
        entries.push(new DataEntry(keyVal, pkVal, valVal));
        i = i + 1;
      }
    } catch (_e) { /* ignore */ }
    return entries;
  }

  clearObjectStore(securityOrigin: string, dbName: string, storeName: string): string {
    let escapedDb: string = dbName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    let escapedStore: string = storeName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    this.cdp.sendJson("IndexedDB.clearObjectStore",
      '{"securityOrigin":"' + securityOrigin + '","databaseName":"' + escapedDb +
      '","objectStoreName":"' + escapedStore + '"}');
    return this.cdp.lastError;
  }

  deleteDatabase(securityOrigin: string, dbName: string): string {
    let escapedDb: string = dbName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    this.cdp.sendJson("IndexedDB.deleteDatabase",
      '{"securityOrigin":"' + securityOrigin + '","databaseName":"' + escapedDb + '"}');
    return this.cdp.lastError;
  }

  // -----------------------------------------------------------------------
  // Geolocation emulation
  // -----------------------------------------------------------------------

  setGeolocation(latitude: number, longitude: number, accuracy: number): string {
    this.cdp.sendJson("Emulation.setGeolocationOverride",
      '{"latitude":' + latitude + ',"longitude":' + longitude + ',"accuracy":' + accuracy + '}');
    return this.cdp.lastError;
  }

  clearGeolocation(): string {
    this.cdp.sendJson("Emulation.clearGeolocationOverride", "");
    return this.cdp.lastError;
  }

  // -----------------------------------------------------------------------
  // Permissions
  // -----------------------------------------------------------------------

  grantPermission(permission: string, origin: string): string {
    this.cdp.sendJson("Browser.grantPermissions",
      '{"permissions":["' + permission + '"],"origin":"' + origin + '"}');
    return this.cdp.lastError;
  }

  resetPermissions(): string {
    this.cdp.sendJson("Browser.resetPermissions", "");
    return this.cdp.lastError;
  }

  // -----------------------------------------------------------------------
  // Media emulation
  // -----------------------------------------------------------------------

  emulateMedia(colorScheme: string, reducedMotion: string): string {
    // Build features JSON array manually
    let featuresJson: string = "[";
    let needComma: boolean = false;
    if (colorScheme !== "") {
      featuresJson = featuresJson + '{"name":"prefers-color-scheme","value":"' + colorScheme + '"}';
      needComma = true;
    }
    if (reducedMotion !== "") {
      if (needComma) featuresJson = featuresJson + ",";
      featuresJson = featuresJson + '{"name":"prefers-reduced-motion","value":"' + reducedMotion + '"}';
    }
    featuresJson = featuresJson + "]";
    // Use the full Emulation.setEmulatedMedia CDP command
    this.cdp.sendJson("Emulation.setEmulatedMedia",
      '{"media":"","features":' + featuresJson + '}');
    return this.cdp.lastError;
  }

  // -----------------------------------------------------------------------
  // Close
  // -----------------------------------------------------------------------

  close(): void {
    this.cdp.targetCloseTarget(this.targetId);
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  private sleepMs(ms: number): void {
    try {
      spawnSync("sleep", [String(ms / 1000)], { timeout: ms + 1000, stdio: "ignore" });
    } catch (_e) {
      try {
        execSync("ping -n 1 127.0.0.1 > nul", { timeout: ms + 1000, stdio: "ignore" });
      } catch (_e2) {
        // ignore
      }
    }
  }
}

// escapeForJs imported from cdp_client
