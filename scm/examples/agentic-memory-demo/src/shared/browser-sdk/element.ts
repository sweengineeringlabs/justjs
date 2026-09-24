// Element — DOM element wrapper. Ported from Rust element.rs.
// Node-only (uses CdpClient).

import { CdpClient, escapeForJs } from "./cdp_client";
import { spawnSync } from "child_process";
import { BoundingBox } from "./types";

// ---------------------------------------------------------------------------
// Element class
// ---------------------------------------------------------------------------

export class Element {
  cdp: CdpClient;
  nodeId: number;
  objectId: string;
  selector: string;

  constructor(cdp: CdpClient, nodeId: number, objectId: string, selector: string) {
    this.cdp = cdp;
    this.nodeId = nodeId;
    this.objectId = objectId;
    this.selector = selector;
  }

  // -----------------------------------------------------------------------
  // Interaction
  // -----------------------------------------------------------------------

  click(): string {
    let box: BoundingBox = this.boundingBox();
    if (this.cdp.lastError !== "") return this.cdp.lastError;
    if (box.width === 0 && box.height === 0) return "element has zero size";

    let x: number = box.x + box.width / 2;
    let y: number = box.y + box.height / 2;
    this.cdp.inputDispatchMouseEvent("mousePressed", x, y, "left", 1, 0);
    this.cdp.inputDispatchMouseEvent("mouseReleased", x, y, "left", 1, 0);
    return this.cdp.lastError;
  }

  dblclick(): string {
    let box: BoundingBox = this.boundingBox();
    if (this.cdp.lastError !== "") return this.cdp.lastError;

    let x: number = box.x + box.width / 2;
    let y: number = box.y + box.height / 2;
    this.cdp.inputDispatchMouseEvent("mousePressed", x, y, "left", 1, 0);
    this.cdp.inputDispatchMouseEvent("mouseReleased", x, y, "left", 1, 0);
    this.cdp.inputDispatchMouseEvent("mousePressed", x, y, "left", 2, 0);
    this.cdp.inputDispatchMouseEvent("mouseReleased", x, y, "left", 2, 0);
    return this.cdp.lastError;
  }

  hover(): string {
    let box: BoundingBox = this.boundingBox();
    if (this.cdp.lastError !== "") return this.cdp.lastError;

    let x: number = box.x + box.width / 2;
    let y: number = box.y + box.height / 2;
    this.cdp.inputDispatchMouseEvent("mouseMoved", x, y, "none", 0, 0);
    return this.cdp.lastError;
  }

  focus(): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'not_found';" +
      "el.focus();" +
      "return 'ok';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "not_found") return "element not found";
    return this.cdp.lastError;
  }

  fill(value: string): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'not_found';" +
      "el.focus();" +
      "el.value = '';" +
      "el.value = " + JSON.stringify(value) + ";" +
      "el.dispatchEvent(new Event('input', { bubbles: true }));" +
      "el.dispatchEvent(new Event('change', { bubbles: true }));" +
      "return 'ok';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "not_found") return "element not found";
    return this.cdp.lastError;
  }

  typeText(text: string): string {
    this.focus();
    let i: number = 0;
    while (i < text.length) {
      let ch: string = text[i];
      this.cdp.inputDispatchKeyEvent("keyDown", ch, ch, 0);
      this.cdp.inputDispatchKeyEvent("keyUp", ch, "", 0);
      i = i + 1;
    }
    return this.cdp.lastError;
  }

  press(key: string): string {
    this.cdp.inputDispatchKeyEvent("keyDown", key, key, 0);
    this.cdp.inputDispatchKeyEvent("keyUp", key, "", 0);
    return this.cdp.lastError;
  }

  clear(): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'not_found';" +
      "el.value = '';" +
      "el.dispatchEvent(new Event('input', { bubbles: true }));" +
      "return 'ok';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "not_found") return "element not found";
    return this.cdp.lastError;
  }

  check(): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'not_found';" +
      "if (!el.checked) el.click();" +
      "return 'ok';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "not_found") return "element not found";
    return this.cdp.lastError;
  }

  uncheck(): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'not_found';" +
      "if (el.checked) el.click();" +
      "return 'ok';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "not_found") return "element not found";
    return this.cdp.lastError;
  }

  selectOption(value: string): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'not_found';" +
      "el.value = " + JSON.stringify(value) + ";" +
      "el.dispatchEvent(new Event('change', { bubbles: true }));" +
      "return 'ok';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "not_found") return "element not found";
    return this.cdp.lastError;
  }

  // -----------------------------------------------------------------------
  // Properties
  // -----------------------------------------------------------------------

  textContent(): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return '__NOT_FOUND__';" +
      "return el.textContent || '';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "__NOT_FOUND__") { this.cdp.lastError = "element not found"; return ""; }
    return result;
  }

  innerText(): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return '__NOT_FOUND__';" +
      "return el.innerText || '';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "__NOT_FOUND__") { this.cdp.lastError = "element not found"; return ""; }
    return result;
  }

  innerHTML(): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return '__NOT_FOUND__';" +
      "return el.innerHTML || '';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "__NOT_FOUND__") { this.cdp.lastError = "element not found"; return ""; }
    return result;
  }

  inputValue(): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return '__NOT_FOUND__';" +
      "return el.value || '';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "__NOT_FOUND__") { this.cdp.lastError = "element not found"; return ""; }
    return result;
  }

  getAttribute(name: string): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return '__NOT_FOUND__';" +
      "var v = el.getAttribute('" + escapeForJs(name) + "');" +
      "return v === null ? '__NULL__' : v;" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "__NOT_FOUND__") { this.cdp.lastError = "element not found"; return ""; }
    if (result === "__NULL__") return "";
    return result;
  }

  getProperty(name: string): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return '__NOT_FOUND__';" +
      "var v = el['" + escapeForJs(name) + "'];" +
      "if (v === undefined || v === null) return '';" +
      "return String(v);" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "__NOT_FOUND__") { this.cdp.lastError = "element not found"; return ""; }
    return result;
  }

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  isVisible(): boolean {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'false';" +
      "var s = window.getComputedStyle(el);" +
      "if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return 'false';" +
      "var r = el.getBoundingClientRect();" +
      "return (r.width > 0 && r.height > 0) ? 'true' : 'false';" +
      "})()";
    return this.cdp.evaluate(js) === "true";
  }

  isHidden(): boolean {
    return !this.isVisible();
  }

  isEnabled(): boolean {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'false';" +
      "return el.disabled ? 'false' : 'true';" +
      "})()";
    return this.cdp.evaluate(js) === "true";
  }

  isDisabled(): boolean {
    return !this.isEnabled();
  }

  isChecked(): boolean {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'false';" +
      "return el.checked ? 'true' : 'false';" +
      "})()";
    return this.cdp.evaluate(js) === "true";
  }

  // -----------------------------------------------------------------------
  // Geometry
  // -----------------------------------------------------------------------

  boundingBox(): BoundingBox {
    return this.cdp.getBoundingRect(this.selector);
  }

  screenshot(): string {
    // Element screenshot via clip region
    let box: BoundingBox = this.boundingBox();
    if (this.cdp.lastError !== "") return "";

    let paramsJson: string = '{"format":"png","clip":{"x":' + box.x + ',"y":' + box.y +
      ',"width":' + box.width + ',"height":' + box.height + ',"scale":1}}';
    let result: string = this.cdp.sendJson("Page.captureScreenshot", paramsJson);
    if (result === "") return "";
    return this.cdp.extractStringField(result, "data");
  }

  // -----------------------------------------------------------------------
  // Drag and drop
  // -----------------------------------------------------------------------

  dragTo(target: Element): string {
    let srcBox: BoundingBox = this.boundingBox();
    if (this.cdp.lastError !== "") return this.cdp.lastError;
    let tgtBox: BoundingBox = target.boundingBox();
    if (target.cdp.lastError !== "") return target.cdp.lastError;

    let sx: number = srcBox.x + srcBox.width / 2;
    let sy: number = srcBox.y + srcBox.height / 2;
    let tx: number = tgtBox.x + tgtBox.width / 2;
    let ty: number = tgtBox.y + tgtBox.height / 2;

    this.cdp.inputDispatchMouseEvent("mouseMoved", sx, sy, "none", 0, 0);
    this.cdp.inputDispatchMouseEvent("mousePressed", sx, sy, "left", 1, 0);
    this.cdp.inputDispatchMouseEvent("mouseMoved", tx, ty, "left", 0, 0);
    this.cdp.inputDispatchMouseEvent("mouseReleased", tx, ty, "left", 1, 0);
    return this.cdp.lastError;
  }

  // -----------------------------------------------------------------------
  // Touch events
  // -----------------------------------------------------------------------

  tap(): string {
    let box: BoundingBox = this.boundingBox();
    if (this.cdp.lastError !== "") return this.cdp.lastError;

    let x: number = box.x + box.width / 2;
    let y: number = box.y + box.height / 2;

    // Enable touch emulation first
    this.cdp.sendJson("Emulation.setTouchEmulationEnabled", '{"enabled":true}');

    this.cdp.sendJson("Input.dispatchTouchEvent",
      '{"type":"touchStart","touchPoints":[{"x":' + x + ',"y":' + y + ',"id":0}]}');
    if (this.cdp.lastError !== "") return this.cdp.lastError;

    this.cdp.sendJson("Input.dispatchTouchEvent",
      '{"type":"touchEnd","touchPoints":[]}');
    return this.cdp.lastError;
  }

  longPress(durationMs: number): string {
    let box: BoundingBox = this.boundingBox();
    if (this.cdp.lastError !== "") return this.cdp.lastError;

    let x: number = box.x + box.width / 2;
    let y: number = box.y + box.height / 2;
    this.cdp.sendJson("Input.dispatchTouchEvent",
      '{"type":"touchStart","touchPoints":[{"x":' + x + ',"y":' + y + '}]}');
    // Wait for duration
    try {
      spawnSync("sleep", [String(durationMs / 1000)], { timeout: durationMs + 1000, stdio: "ignore" });
    } catch (_e) { /* ignore */ }
    this.cdp.sendJson("Input.dispatchTouchEvent",
      '{"type":"touchEnd","touchPoints":[]}');
    return this.cdp.lastError;
  }

  // -----------------------------------------------------------------------
  // File upload
  // -----------------------------------------------------------------------

  setInputFiles(files: string[]): string {
    let js: string =
      "(function() {" +
      "var el = document.querySelector('" + escapeForJs(this.selector) + "');" +
      "if (!el) return 'not_found';" +
      "return el.tagName.toLowerCase() === 'input' && el.type === 'file' ? 'ok' : 'not_file';" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    if (result === "not_found") return "element not found";
    if (result === "not_file") return "element is not a file input";

    // Use DOM.setFileInputFiles via CDP
    // First resolve the node
    let docNodeId: number = this.cdp.domGetDocument();
    if (docNodeId === 0) return "failed to get document";
    let nodeId: number = this.cdp.domQuerySelector(docNodeId, this.selector);
    if (nodeId === 0) return "element not found via DOM";

    // Build files JSON array
    let filesJson: string = "[";
    let fi: number = 0;
    while (fi < files.length) {
      if (fi > 0) filesJson = filesJson + ",";
      filesJson = filesJson + '"' + files[fi] + '"';
      fi = fi + 1;
    }
    filesJson = filesJson + "]";
    this.cdp.sendJson("DOM.setFileInputFiles", '{"nodeId":' + nodeId + ',"files":' + filesJson + '}');
    return this.cdp.lastError;
  }
}

// escapeForJs imported from cdp_client
