import { Window } from "happy-dom";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname } from "node:path";

const nodeFetch = globalThis.fetch;
const mime = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".html": "text/html" };
const server = createServer((req, res) => {
  const path = `./dist${req.url.split("?")[0]}`;
  if (!existsSync(path)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "Content-Type": mime[extname(path)] ?? "application/octet-stream" });
  res.end(readFileSync(path));
});
const origin = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
server.unref();

const window = new Window({ url: `${origin}/` });
const document = window.document;
for (const key of Object.getOwnPropertyNames(window)) {
  if (!(key in globalThis)) { try { globalThis[key] = window[key]; } catch {} }
}
globalThis.window = window;
globalThis.document = document;
globalThis.fetch = (input, init) => nodeFetch(typeof input === "string" ? new URL(input, document.baseURI) : input, init);
document.body.innerHTML = `<div id="app"><nav><button class="nav-btn" data-route="/home">Home</button><button class="nav-btn" data-route="/chat">Chat</button></nav>
  <div id="mount-home"></div><div id="mount-editor"></div><div id="mount-chat"></div><div id="mount-review"></div><div id="mount-scaffold"></div><div id="mount-connect"></div>
  <button id="theme-toggle-btn"></button><button id="settings-btn"></button><div id="settings-panel" hidden><div id="settings-backdrop"></div><button id="settings-close-btn"></button>
  <select id="settings-theme-select"></select><input id="settings-api-key"><button id="settings-api-key-save"></button><button id="settings-api-key-clear"></button><p id="settings-api-key-status"></p></div></div>`;

const entry = readdirSync("./dist/assets").find((file) => /^index-.*\.js$/.test(file));
if (!entry) throw new Error("Vite entry bundle was not found");
await import(new URL(`./dist/assets/${entry}`, import.meta.url).href);
for (let attempt = 0; attempt < 100 && document.title !== "ai-code-editor: mounted" && !document.title.startsWith("ai-code-editor: boot failed"); attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 50));
}
if (document.title !== "ai-code-editor: mounted") throw new Error(`Boot failed: ${document.title}`);
for (const name of ["home", "editor", "chat", "review", "scaffold", "connect"]) {
  if (!document.querySelector(`#mount-${name}`).innerHTML.trim()) throw new Error(`Generated route mount is empty: ${name}`);
}
console.log("AI editor browser smoke checks passed: all generated route mounts rendered.");
