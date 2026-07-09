import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { writeFileSync, mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { renderComponent } from "../core/renderer.js"

// Closes justjs#66: ADR-0005 claims a real browser natively hoists a
// `<template shadowrootmode="open">` into a real, attached shadow root
// during HTML parsing - a claim `happy-dom` (used by hydration_int_test.ts)
// cannot verify at all, since it doesn't implement declarative-shadow-DOM
// parsing. This test checks it against a real, locally installed Chrome via
// `chromiumctl-cli` (../chromiumctl, a sibling Rust CDP tool - not Playwright;
// this ecosystem already has an in-house one, see ADR-0005 and justjs#66's
// history for why Playwright and justweb's own `jsc`-dependent browser-sdk
// were both rejected).
//
// `chromiumctl-cli` is an external tool, not a workspace dependency - it is
// not built as part of this repo's own tooling, so this test skips (not
// fails) when it can't find a real binary, exactly like justweb's own
// generated browser tests skip when Chrome itself isn't found. Point
// CHROMIUMCTL_CLI_PATH at a built `chromiumctl-cli` (or `chromiumctl-cli.exe`)
// to run it for real.

const CHROMIUMCTL_BIN = process.env["CHROMIUMCTL_CLI_PATH"] || "chromiumctl-cli"
const PORT = 9420

function chromiumctlAvailable(): boolean {
  try {
    Bun.spawnSync([CHROMIUMCTL_BIN, "eval", "--port", "1", "--script", "1"])
    return true
  } catch {
    return false
  }
}

function chromiumctl(args: string[]): { stdout: string; exitCode: number } {
  const result = Bun.spawnSync([CHROMIUMCTL_BIN, ...args])
  return { stdout: result.stdout.toString(), exitCode: result.exitCode ?? 1 }
}

function evalJson(script: string): unknown {
  const { stdout, exitCode } = chromiumctl(["eval", "--port", String(PORT), "--script", script, "--output", "json"])
  if (exitCode !== 0) {
    throw new Error(`chromiumctl eval failed: ${stdout}`)
  }
  return JSON.parse(stdout).result
}

const available = chromiumctlAvailable()

describe.skipIf(!available)("SSR output hydrates in a real browser (justjs#66)", () => {
  let tmpDir: string

  beforeAll(() => {
    GlobalRegistrator.register()
    tmpDir = mkdtempSync(join(tmpdir(), "justjs-ssr-hydration-"))
  })

  afterAll(async () => {
    await GlobalRegistrator.unregister()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it("test_real_chrome_hoists_declarative_shadow_dom_and_survives_a_guarded_client_upgrade", async () => {
    // Launching a real Chrome process plus two CDP round-trips genuinely
    // takes longer than bun:test's 5000ms default.
    class HydrationCounter extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return
        const shadow = this.attachShadow({ mode: "open" })
        shadow.innerHTML = `<span>count:${this.getAttribute("count") ?? "0"}</span>`
      }
    }
    const load = async (): Promise<CustomElementConstructor> => HydrationCounter

    const rendered = await renderComponent("x-hydration-counter", load, { count: "5" })
    expect(rendered.shadowDom).toBe("<span>count:5</span>")

    // The client-side script that would hydrate this page in a real app -
    // defines and registers the SAME class shape server-side rendering
    // used, guarded exactly like a real component would be. Its own
    // connectedCallback re-runs on upgrade (browsers always call it), but
    // must not clobber the server-rendered content if it's idempotent.
    const html = `<!doctype html>
<html>
<body>
${rendered.html}
<script>
  class HydrationCounter extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const shadow = this.attachShadow({ mode: "open" });
      shadow.innerHTML = "<span>count:" + (this.getAttribute("count") || "0") + "</span>";
    }
  }
  customElements.define("x-hydration-counter", HydrationCounter);
  window.__HydrationCounter = HydrationCounter;
</script>
</body>
</html>`

    const pagePath = join(tmpDir, "page.html")
    writeFileSync(pagePath, html)
    const pageUrl = `file:///${pagePath.replace(/\\/g, "/")}`

    const { exitCode: launchExit, stdout: launchOut } = chromiumctl([
      "launch",
      "--url",
      pageUrl,
      "--port",
      String(PORT),
    ])
    expect(launchExit).toBe(0)
    if (launchExit !== 0) throw new Error(`launch failed: ${launchOut}`)

    try {
      // AC1: real declarative-shadow-DOM parsing produced a real, attached
      // shadow root with exactly the server-rendered content, and the
      // client-side class's own guarded connectedCallback (which does run
      // on upgrade) did not overwrite it. `.trim()` only strips the
      // insignificant surrounding whitespace renderComponent()'s own
      // <template> indentation adds around the single-line shadowDom this
      // test uses - the content itself must still match exactly.
      const shadowContent = evalJson(
        "document.querySelector('x-hydration-counter').shadowRoot.innerHTML"
      )
      expect((shadowContent as string).trim()).toBe("<span>count:5</span>")

      // AC2: the element the browser upgraded is a genuine instance of the
      // real class - exactly the check adaptCustomElementRegistry's reuse
      // branch performs (`existing instanceof ElementCtor`) client-side.
      // Proves that check would succeed against real, DSD-hydrated markup,
      // not just against happy-dom.
      const isRealInstance = evalJson(
        "document.querySelector('x-hydration-counter') instanceof window.__HydrationCounter"
      )
      // chromiumctl's --output json stringifies every eval result, booleans
      // included (confirmed by hand) - "true", not the native boolean.
      expect(isRealInstance).toBe("true")
    } finally {
      chromiumctl(["stop", "--port", String(PORT)])
    }
  }, 20000)
})
