import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const examples = [
  "scm/examples/hello-justjs",
  "scm/examples/cross-target-demo",
  "scm/examples/agentic-memory-demo",
  "scm/examples/ai-code-editor",
]

type Manifest = {
  format?: string
  formatVersion?: number
  generator?: { name?: string; sourceDirty?: boolean }
  artifacts?: Array<{ path?: string; sha256?: string }>
}

for (const example of examples) {
  const root = resolve(example)
  const manifestPath = resolve(root, "public/justweb-artifacts.gen.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest

  if (manifest.format !== "justweb-artifact-manifest" || manifest.formatVersion !== 1) {
    throw new Error(`${example}: unsupported JustWeb artifact manifest format`)
  }
  if (manifest.generator?.name !== "justw" || manifest.generator.sourceDirty !== false) {
    throw new Error(`${example}: manifest must identify a clean justw generation`)
  }
  if (!manifest.artifacts?.length) {
    throw new Error(`${example}: manifest contains no artifacts`)
  }

  for (const artifact of manifest.artifacts) {
    if (!artifact.path || !artifact.sha256 || artifact.path.includes("..") || artifact.path.startsWith("/")) {
      throw new Error(`${example}: malformed artifact entry`)
    }
    const bytes = await readFile(resolve(root, artifact.path))
    const actual = createHash("sha256").update(bytes).digest("hex")
    if (actual !== artifact.sha256) {
      throw new Error(`${example}: artifact drift detected for ${artifact.path}`)
    }
  }

  const paths = new Set(manifest.artifacts.map((artifact) => artifact.path))
  for (const required of ["dom-address-map.json", "registry.gen.ts", "component-registry.gen.ts"]) {
    if (![...paths].some((path) => path?.endsWith(required))) {
      throw new Error(`${example}: manifest is missing ${required}`)
    }
  }
}

console.log(`Validated JustWeb artifact manifests for ${examples.length} examples.`)
