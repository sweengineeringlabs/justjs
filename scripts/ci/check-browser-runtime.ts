import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

// Check every emitted JS chunk, including lazily loaded UI routes. This catches
// accidental inclusion of the native tooling providers in browser/WebView code.
const root = resolve(import.meta.dir, "../..")
for (const app of ["hello-justjs", "cross-target-demo", "agentic-memory-demo", "ai-code-editor"]) {
  const directory = resolve(root, "scm/examples", app, process.argv.includes("--cli") ? "dist-cli" : "dist")
  const chunks = readdirSync(directory, { recursive: true }).filter((file) => typeof file === "string" && file.endsWith(".js"))
  if (chunks.length === 0) throw new Error(`${app}: build the example before checking its browser runtime`)
  for (const chunk of chunks) {
    const code = readFileSync(resolve(directory, String(chunk)), "utf8")
    if (/\bBun\.(?:TOML|Transpiler|escapeHTML|Archive)\b/.test(code)) {
      throw new Error(`${app}/${chunk}: native Bun tooling API found in a browser bundle`)
    }
  }
  console.log(`${app}: ${chunks.length} browser chunks contain no native Bun tooling API references`)
}
