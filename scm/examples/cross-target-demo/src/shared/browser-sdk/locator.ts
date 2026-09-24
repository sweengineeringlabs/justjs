// Locator — reliable element selection with auto-wait. Ported from Rust locator.rs.
// Node-only (uses CdpClient).

import { CdpClient, escapeForJs } from "./cdp_client";
import { Element } from "./element";

// ---------------------------------------------------------------------------
// Filter kind constants
// ---------------------------------------------------------------------------

export let FILTER_HAS_TEXT: string = "has_text";
export let FILTER_HAS_TEXT_EXACT: string = "has_text_exact";
export let FILTER_HAS_ATTRIBUTE: string = "has_attribute";
export let FILTER_NTH: string = "nth";
export let FILTER_FIRST: string = "first";
export let FILTER_LAST: string = "last";
export let FILTER_VISIBLE: string = "visible";

// ---------------------------------------------------------------------------
// ARIA role constants
// ---------------------------------------------------------------------------

export let ROLE_BUTTON: string = "button";
export let ROLE_CHECKBOX: string = "checkbox";
export let ROLE_COMBOBOX: string = "combobox";
export let ROLE_DIALOG: string = "dialog";
export let ROLE_HEADING: string = "heading";
export let ROLE_LINK: string = "link";
export let ROLE_LIST: string = "list";
export let ROLE_LISTITEM: string = "listitem";
export let ROLE_MENU: string = "menu";
export let ROLE_MENUITEM: string = "menuitem";
export let ROLE_NAVIGATION: string = "navigation";
export let ROLE_PROGRESSBAR: string = "progressbar";
export let ROLE_RADIO: string = "radio";
export let ROLE_SEARCH: string = "search";
export let ROLE_SEARCHBOX: string = "searchbox";
export let ROLE_SLIDER: string = "slider";
export let ROLE_TAB: string = "tab";
export let ROLE_TABPANEL: string = "tabpanel";
export let ROLE_TABLE: string = "table";
export let ROLE_TEXTBOX: string = "textbox";
export let ROLE_TREE: string = "tree";
export let ROLE_TREEITEM: string = "treeitem";

// ---------------------------------------------------------------------------
// LocatorFilter
// ---------------------------------------------------------------------------

export class LocatorFilter {
  kind: string;
  value: string;
  name: string;
  index: number;

  constructor(kind: string, value: string, name: string, index: number) {
    this.kind = kind;
    this.value = value;
    this.name = name;
    this.index = index;
  }
}

// ---------------------------------------------------------------------------
// Locator class
// ---------------------------------------------------------------------------

export class Locator {
  cdp: CdpClient;
  selector: string;
  timeout: number;
  filters: LocatorFilter[];

  constructor(cdp: CdpClient, selector: string) {
    this.cdp = cdp;
    this.selector = selector;
    this.timeout = 5000;
    this.filters = [];
  }

  static forRole(cdp: CdpClient, role: string): Locator {
    return new Locator(cdp, "[role='" + role + "']");
  }

  static forText(cdp: CdpClient, text: string, exact: boolean): Locator {
    let loc: Locator = new Locator(cdp, "*");
    if (exact) {
      loc.filters.push(new LocatorFilter(FILTER_HAS_TEXT_EXACT, text, "", 0));
    } else {
      loc.filters.push(new LocatorFilter(FILTER_HAS_TEXT, text, "", 0));
    }
    return loc;
  }

  static forLabel(cdp: CdpClient, label: string): Locator {
    return new Locator(cdp, "label:has-text('" + label + "') + input, [aria-label='" + label + "']");
  }

  static forTestId(cdp: CdpClient, testId: string): Locator {
    return new Locator(cdp, "[data-testid='" + testId + "']");
  }

  /** Locate an element by its compiler-assigned DDAS ID (data-ddas-id attribute). */
  static forId(cdp: CdpClient, id: string): Locator {
    return new Locator(cdp, "[data-ddas-id='" + id + "']");
  }

  // -----------------------------------------------------------------------
  // Chaining
  // -----------------------------------------------------------------------

  locator(childSelector: string): Locator {
    let combined: string = this.selector + " " + childSelector;
    let child: Locator = new Locator(this.cdp, combined);
    child.timeout = this.timeout;
    return child;
  }

  withTimeout(ms: number): Locator {
    this.timeout = ms;
    return this;
  }

  filterHasText(text: string): Locator {
    this.filters.push(new LocatorFilter(FILTER_HAS_TEXT, text, "", 0));
    return this;
  }

  filterHasAttribute(name: string, value: string): Locator {
    this.filters.push(new LocatorFilter(FILTER_HAS_ATTRIBUTE, value, name, 0));
    return this;
  }

  nth(index: number): Locator {
    this.filters.push(new LocatorFilter(FILTER_NTH, "", "", index));
    return this;
  }

  first(): Locator {
    return this.nth(0);
  }

  last(): Locator {
    this.filters.push(new LocatorFilter(FILTER_LAST, "", "", 0));
    return this;
  }

  visible(): Locator {
    this.filters.push(new LocatorFilter(FILTER_VISIBLE, "true", "", 0));
    return this;
  }

  // -----------------------------------------------------------------------
  // Resolution
  // -----------------------------------------------------------------------

  resolve(): Element {
    let start: number = Date.now();
    while (Date.now() - start < this.timeout) {
      let js: string = this.buildQueryJs();
      let result: string = this.cdp.evaluate(js);
      if (result !== "" && result !== "null" && result !== "__EMPTY__") {
        return new Element(this.cdp, 0, "", this.resolvedSelector(result));
      }
      // Brief wait
      try {
        require("child_process").spawnSync("sleep", ["0.1"], { timeout: 500, stdio: "ignore" });
      } catch (_e) { /* ignore */ }
    }
    this.cdp.lastError = "locator timeout: " + this.selector;
    return new Element(this.cdp, 0, "", this.selector);
  }

  // -----------------------------------------------------------------------
  // Actions (delegate to resolved Element)
  // -----------------------------------------------------------------------

  click(): string {
    return this.resolve().click();
  }

  fill(value: string): string {
    return this.resolve().fill(value);
  }

  typeText(text: string): string {
    return this.resolve().typeText(text);
  }

  textContent(): string {
    return this.resolve().textContent();
  }

  isVisible(): boolean {
    return this.resolve().isVisible();
  }

  count(): number {
    let js: string =
      "(function() {" +
      "return document.querySelectorAll('" + escapeForJs(this.selector) + "').length;" +
      "})()";
    let result: string = this.cdp.evaluate(js);
    let n: number = parseInt(result, 10);
    return isNaN(n) ? 0 : n;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private buildQueryJs(): string {
    // Build a JS expression that returns the effective selector or null
    let hasTextFilter: string = "";
    let hasNth: number = -1;
    let wantLast: boolean = false;
    let wantVisible: boolean = false;

    let i: number = 0;
    while (i < this.filters.length) {
      let f: LocatorFilter = this.filters[i];
      if (f.kind === FILTER_HAS_TEXT || f.kind === FILTER_HAS_TEXT_EXACT) hasTextFilter = f.value;
      if (f.kind === FILTER_NTH) hasNth = f.index;
      if (f.kind === FILTER_LAST) wantLast = true;
      if (f.kind === FILTER_VISIBLE) wantVisible = true;
      i = i + 1;
    }

    if (hasTextFilter === "" && hasNth < 0 && !wantLast && !wantVisible) {
      // Simple case
      return "(function() { var el = document.querySelector('" + escapeForJs(this.selector) + "'); return el ? 'ok' : 'null'; })()";
    }

    // Complex case: find all, filter
    return "(function() {" +
      "var all = document.querySelectorAll('" + escapeForJs(this.selector) + "');" +
      "var matched = [];" +
      "for (var i = 0; i < all.length; i++) {" +
      (hasTextFilter !== "" ?
        "if (all[i].textContent.indexOf('" + escapeForJs(hasTextFilter) + "') === -1) continue;" : "") +
      (wantVisible ?
        "var s = window.getComputedStyle(all[i]); if (s.display === 'none' || s.visibility === 'hidden') continue;" : "") +
      "matched.push(i);" +
      "}" +
      "if (matched.length === 0) return 'null';" +
      (wantLast ? "return String(matched[matched.length - 1]);" :
        hasNth >= 0 ? "return matched.length > " + hasNth + " ? String(matched[" + hasNth + "]) : 'null';" :
          "return String(matched[0]);") +
      "})()";
  }

  private resolvedSelector(result: string): string {
    if (result === "ok") return this.selector;
    // result is an index — build nth-child selector
    let idx: number = parseInt(result, 10);
    if (isNaN(idx)) return this.selector;
    return this.selector + ":nth-child(" + (idx + 1) + ")";
  }
}

// escapeForJs imported from cdp_client
