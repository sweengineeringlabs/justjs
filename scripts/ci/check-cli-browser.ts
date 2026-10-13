// Run after justjs build for every example. Uses real Chrome and no browser SDK.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const chrome = process.env.CHROME_PATH ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].find(existsSync);
if (!chrome) throw new Error("Set CHROME_PATH to a Chrome/Chromium executable.");
const profile = mkdtempSync(join(tmpdir(), "justjs-browser-"));
const browser = spawn(chrome, [
  "--headless=new", "--no-sandbox", "--no-first-run", "--no-default-browser-check",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`,
], { windowsHide: true, stdio: "ignore" });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(fn: () => Promise<T>, label: string, timeout = 30000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out: ${label}`);
}
let socket: WebSocket | undefined;
let server: ReturnType<typeof Bun.spawn> | undefined;
try {
  const port = await until(async () => {
    const path = join(profile, "DevToolsActivePort");
    return existsSync(path) ? readFileSync(path, "utf8").split("\n")[0] : "";
  }, "Chrome startup");
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json() as any;
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    socket!.onopen = () => resolve();
    socket!.onerror = () => reject(new Error("Chrome connection failed"));
  });
  let nextId = 0;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  let errors: string[] = [];
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(JSON.stringify(message.error)));
      else request?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(message.params.exceptionDetails));
  };
  function call(method: string, params: object = {}): Promise<any> {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
      pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      socket!.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression: string): Promise<any> {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(`${expression}: ${JSON.stringify(result.exceptionDetails)}`);
    return result.result.value;
  }
  await call("Runtime.enable");
  await call("Page.enable");
  for (const [app, port] of [["hello-justjs", 3000], ["cross-target-demo", 3200], ["agentic-memory-demo", 3202], ["ai-code-editor", 3201]] as const) {
    const root = resolve("scm/examples", app);
    const origin = `http://127.0.0.1:${port}`;
    // Refuse to accidentally validate another process already on the configured port.
    const occupied = await fetch(origin, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
    assert.equal(occupied, false, `Port ${port} already in use`);
    server = Bun.spawn(["justjs", "dev"], { cwd: join(root, "src"), stdout: "pipe", stderr: "pipe" });
    const stdout = new Response(server.stdout).text();
    const stderr = new Response(server.stderr).text();
    try {
      const html = await until(async () => {
        if (server!.exitCode !== null) throw new Error(`Dev exited: ${await stderr}`);
        return fetch(origin).then(async r => r.ok ? r.text() : "", () => "");
      }, `${app} dev startup`, 60000);
      const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
      assert.ok(scripts.length, "Page must reference a bundle");
      for (const script of scripts) {
        const response = await fetch(new URL(script, origin));
        assert.equal(response.status, 200);
        assert.match(response.headers.get("content-type") ?? "", /javascript/);
        assert.ok((await response.text()).length > 100);
      }
      errors = [];
      await call("Page.navigate", { url: origin });
      const wait = (expression: string) => until(() => evaluate(expression), `${app}: ${expression}`, 60000);
      if (app === "hello-justjs") {
        await wait("!!document.querySelector('#counter-page #increment')");
        await evaluate("document.querySelector('#increment').click()");
        await wait("document.querySelector('#counter-value')?.textContent === '1'");
        await evaluate(`document.querySelector('[data-page="form"]').click()`);
        await wait("!!document.querySelector('#form-page form')");
        await evaluate("document.querySelector('#form-page form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))");
        await wait("document.querySelector('#form-page').textContent.toLowerCase().includes('required')");
      } else if (app === "cross-target-demo") {
        await wait("!!document.querySelector('#inc')");
        await evaluate("document.querySelector('#inc').click(); document.querySelector('#inc').click()");
        await wait("document.querySelector('#count-value')?.textContent === '2'");
        await evaluate(`document.querySelector('[data-route="/login"]').click()`);
        await wait("document.querySelector('#mount-login')?.classList.contains('active')");
        await evaluate("document.querySelector('#login-username').value = 'e2e'; document.querySelector('#login-password').value = 'local-demo'; document.querySelector('#login-submit').click()");
        await wait("!!document.querySelector('#logout')");
        await evaluate("document.querySelector('#logout').click()");
        await wait("!!document.querySelector('#login-submit')");
      } else if (app === "agentic-memory-demo") {
        await wait("document.title.includes('mounted')");
        await evaluate("document.querySelector('#settings-btn').click()");
        await wait("document.querySelector('#settings-panel')?.hidden === false");
        await evaluate("document.querySelector('#settings-close-btn').click()");
        await evaluate(`document.querySelector('[data-route="/dashboard"]').click()`);
        await wait("!!document.querySelector('#widget-add')");
        await evaluate("document.querySelector('#widget-add').click()");
        await evaluate("document.querySelector('#dashboard-add-content').value = 'E2E browser memory'; document.querySelector('#dashboard-add-form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))");
        await wait("document.querySelector('#dashboard-add-confirm')?.hidden === false");
        await evaluate(`document.querySelector('.dash-subnav-btn[data-view=browse]').click()`);
        await wait("document.querySelector('#dashboard-results')?.textContent.includes('E2E browser memory')");
      } else {
        await wait("document.title === 'ai-code-editor: mounted'");
        for (const route of ["home", "editor", "chat", "review", "scaffold", "connect"]) {
          assert.ok(await evaluate(`document.querySelector('#mount-${route}')?.innerHTML.trim()`), `Empty mount: ${route}`);
        }
        await evaluate(`document.querySelector('#workspace-overview-grid').shadowRoot.querySelector('[data-id="development"]').click()`);
        await evaluate(`document.querySelector('#workspace-function-grid').shadowRoot.querySelector('[data-id="Editor"]').click()`);
        await wait("!!document.querySelector('#editor-textarea')");
        await evaluate("const input = document.querySelector('#editor-textarea'); input.value = 'const e2e = 42;'; input.dispatchEvent(new Event('input', {bubbles:true}))");
        await delay(700);
        assert.ok(await evaluate("Object.values(localStorage).some(value => value.includes('const e2e = 42;'))"), "Editor state must persist");
      }
      assert.deepEqual(errors, [], "Browser runtime exceptions");
      console.log(`PASS ${app}: page, bundles, Chrome interactions, nested project discovery`);
    } finally {
      server.kill();
      await server.exited;
      server = undefined;
      await until(async () => fetch(origin).then(() => false, () => true), `${app} server shutdown`);
      await Promise.all([stdout, stderr]);
      console.log(`PASS ${app}: dev server stopped`);
    }
  }
} catch (error) {
  console.error(error);
  throw error;
} finally {
  server?.kill();
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
  await delay(1000);
  socket?.close();
  browser.kill();
  await delay(500);
  // Only this run's unique temporary Chrome profile is removed.
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch { console.warn(`Chrome profile retained for inspection: ${profile}`); }
}
