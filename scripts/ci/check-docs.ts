import { existsSync, readFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"

/**
 * Documentation checks (justjs#165):
 *
 * 1. Every relative link in README.md, CLAUDE.md and docs/ resolves to a file. External URLs,
 *    `#anchors` and fenced code blocks are skipped; a fragment is checked for the file only.
 * 2. The pins are consistent where they are declared: all example `justjs.config.toml` files
 *    agree on the `justw` version and revision, CI pins one exact Rust and one exact Bun, and
 *    CI builds the generator from the very revision the examples pin.
 * 3. Versions stated in prose equal those pins: `justw X.Y.Z` the generator version, `Rust X.Y.Z`
 *    the CI Rust toolchain, `Bun X.Y.Z` the CI Bun, `generator_revision … <hex>` the revision,
 *    and a hash on a line that mentions `justweb-dev` a prefix of the CI checkout ref.
 *
 * Files in HISTORY record what was true on a past date, so (3) is not applied to them;
 * their links are still checked.
 */

const HISTORY = ["docs/e2e-validation.md", "docs/adr/", "docs/3-design/justweb-compliance.md", "docs/POC-CONTRACT-SPEC.md"]
const FENCE = /^\s*```/

export interface Pins {
  generatorVersion: string
  generatorRevision: string
  rust: string
  bun: string
  cliRef: string
}

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n")
const distinct = (values: string[]) => [...new Set(values)]

function listMarkdown(root: string): string[] {
  const files = ["README.md", "CLAUDE.md"].filter((f) => existsSync(resolve(root, f)))
  for (const f of new Bun.Glob("docs/**/*.md").scanSync({ cwd: root, onlyFiles: true })) files.push(f.replace(/\\/g, "/"))
  return files.sort()
}

/** Text with fenced code blocks removed (used for link checking, where examples are not links). */
function withoutFences(text: string): string {
  let inside = false
  return text
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) { inside = !inside; return "" }
      return inside ? "" : line
    })
    .join("\n")
}

export function readPins(root: string, errors: string[]): Pins | undefined {
  const versions: string[] = []
  const revisions: string[] = []
  for (const f of new Bun.Glob("scm/examples/*/justjs.config.toml").scanSync({ cwd: root, onlyFiles: true })) {
    const text = read(resolve(root, f))
    // Examples that do not use the JustWeb generator declare no pin at all; that is fine.
    if (!/^generator_(version|revision)\s*=/m.test(text)) continue
    const version = text.match(/^generator_version\s*=\s*"([^"]+)"/m)?.[1]
    const revision = text.match(/^generator_revision\s*=\s*"([0-9a-f]{40})"/m)?.[1]
    if (!version || !revision) { errors.push(`${f.replaceAll("\\", "/")}: generator_version and a 40-character generator_revision are both required`); continue }
    versions.push(version)
    revisions.push(revision)
  }
  if (!versions.length) { errors.push("no scm/examples/*/justjs.config.toml with a justw pin found"); return undefined }
  if (distinct(versions).length > 1 || distinct(revisions).length > 1) {
    errors.push(`examples disagree on the justw pin: versions ${distinct(versions).join(", ")}, revisions ${distinct(revisions).join(", ")}`)
    return undefined
  }

  const ci = read(resolve(root, ".github/workflows/ci.yml"))
  const rust = distinct([...ci.matchAll(/dtolnay\/rust-toolchain@(\S+)/g)].map((m) => m[1]!))
  const bun = distinct([...ci.matchAll(/bun-version:\s*"?([^"\s]+)"?/g)].map((m) => m[1]!))
  const refs = [...ci.matchAll(/repository:\s*sweengineeringlabs\/(justweb-dev|justweb)\s*\n\s*ref:\s*([0-9a-f]{40})/g)]
  const cliRefs = distinct(refs.filter((m) => m[1] === "justweb-dev").map((m) => m[2]!))
  const generatorRefs = distinct(refs.filter((m) => m[1] === "justweb").map((m) => m[2]!))

  if (rust.length !== 1 || !/^\d+\.\d+\.\d+$/.test(rust[0]!)) errors.push(`ci.yml must pin exactly one exact Rust toolchain (dtolnay/rust-toolchain@X.Y.Z), found: ${rust.join(", ") || "none"}`)
  if (bun.length !== 1) errors.push(`ci.yml must pin exactly one Bun version, found: ${bun.join(", ") || "none"}`)
  if (cliRefs.length !== 1) errors.push(`ci.yml must check out sweengineeringlabs/justweb-dev at exactly one 40-character commit, found: ${cliRefs.join(", ") || "none"}`)
  if (generatorRefs.length !== 1) errors.push(`ci.yml must check out sweengineeringlabs/justweb at exactly one 40-character commit, found: ${generatorRefs.join(", ") || "none"}`)
  else if (generatorRefs[0] !== revisions[0]) errors.push(`ci.yml builds justw from ${generatorRefs[0]} but the examples pin generator_revision ${revisions[0]}`)
  if (errors.length) return undefined
  return { generatorVersion: versions[0]!, generatorRevision: revisions[0]!, rust: rust[0]!, bun: bun[0]!, cliRef: cliRefs[0]! }
}

export function checkDocs(root: string): string[] {
  const errors: string[] = []
  const pins = readPins(root, errors)
  for (const file of listMarkdown(root)) {
    const text = read(resolve(root, file))

    for (const match of withoutFences(text).matchAll(/\]\(([^)\s]+)[^)]*\)/g)) {
      const target = match[1]!
      if (/^([a-z][a-z0-9+.-]*:|#)/i.test(target)) continue
      const path = target.split("#")[0]!
      if (path && !existsSync(resolve(root, dirname(file), decodeURIComponent(path)))) {
        errors.push(`${file}: broken link '${target}' (no such file: ${relative(root, resolve(root, dirname(file), path)).replace(/\\/g, "/")})`)
      }
    }

    if (!pins || HISTORY.some((h) => file === h || (h.endsWith("/") && file.startsWith(h)))) continue
    const claim = (what: string, found: string, expected: string) => {
      if (found !== expected) errors.push(`${file}: says ${what} ${found} but the pin is ${expected}`)
    }
    for (const m of text.matchAll(/\bjustw\b\W{1,3}(\d+\.\d+\.\d+)/g)) claim("justw", m[1]!, pins.generatorVersion)
    for (const m of text.matchAll(/\bRust\b\W{1,3}(\d+\.\d+\.\d+)/g)) claim("Rust", m[1]!, pins.rust)
    for (const m of text.matchAll(/\bBun\b\W{1,3}(\d+\.\d+\.\d+)/g)) claim("Bun", m[1]!, pins.bun)
    // A commit hash is attributed to the nearest keyword before it on the same line, so a line
    // that mentions both the generator pin and the CLI checkout checks each hash against its own.
    for (const line of text.split("\n")) {
      for (const m of line.matchAll(/\b([0-9a-f]{7,40})\b/g)) {
        const hash = m[1]!
        if (!(/[a-f]/.test(hash) && /\d/.test(hash))) continue // a number or a word, not a hash
        const before = line.slice(0, m.index)
        const revision = before.lastIndexOf("generator_revision")
        const cli = before.lastIndexOf("justweb-dev")
        if (revision < 0 && cli < 0) continue
        if (revision > cli) {
          if (!pins.generatorRevision.startsWith(hash)) errors.push(`${file}: generator_revision ${hash} is not the pinned ${pins.generatorRevision}`)
        } else if (!pins.cliRef.startsWith(hash)) {
          errors.push(`${file}: justweb-dev ref ${hash} is not the CI checkout ${pins.cliRef}`)
        }
      }
    }
  }
  return errors
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "../..")
  const errors = checkDocs(root)
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`)
    console.error("docs check FAILED")
    process.exit(1)
  }
  const pins = readPins(root, [])!
  console.log(`docs check OK: links resolve; justw ${pins.generatorVersion} @ ${pins.generatorRevision.slice(0, 7)}, Rust ${pins.rust}, Bun ${pins.bun}, CLI ${pins.cliRef.slice(0, 7)}`)
}
