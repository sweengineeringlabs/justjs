import { expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { checkDocs } from "../../scripts/ci/check-docs.js"

const REV = "4d2828d47ac0a5eac50677efa835994dfdee18a9"
const CLI = "5db7d42d2c62ce6053df5f2fb462693384c4816d"
const PREFIX = "justjs-docs-test-"

const config = (version = "0.1.2", revision = REV) =>
  `[justweb]\ngenerator_version = "${version}"\ngenerator_revision = "${revision}"\n`

const ci = (opts: { rust?: string; bun?: string; generatorRef?: string; cliRef?: string } = {}) => `jobs:
  a:
    steps:
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "${opts.bun ?? "1.4.2"}"
      - uses: actions/checkout@v4
        with:
          repository: sweengineeringlabs/justweb
          ref: ${opts.generatorRef ?? REV}
      - uses: dtolnay/rust-toolchain@${opts.rust ?? "1.99.1"}
      - uses: actions/checkout@v4
        with:
          repository: sweengineeringlabs/justweb-dev
          ref: ${opts.cliRef ?? CLI}
`

function fixture(files: Record<string, string>, check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), PREFIX))
  try {
    const contents: Record<string, string> = {
      ".github/workflows/ci.yml": ci(),
      "scm/examples/one/justjs.config.toml": config(),
      "scm/examples/two/justjs.config.toml": config(),
      "scm/examples/plain/justjs.config.toml": "[security]\nstrategy = \"noop\"\n",
      "README.md": "# Project\n\nSee [the guide](docs/guide.md).\n",
      "docs/guide.md": "Uses justw 0.1.2, Rust 1.99.1 and Bun 1.4.2.\n",
      ...files,
    }
    for (const [path, content] of Object.entries(contents)) {
      const target = join(root, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
    check(root)
  } finally {
    if (!root.startsWith(join(tmpdir(), PREFIX))) throw new Error("Unsafe fixture cleanup path")
    rmSync(root, { recursive: true, force: true })
  }
}

test("consistent pins, links and prose pass; examples without a generator pin are ignored", () => {
  fixture({}, (root) => expect(checkDocs(root)).toEqual([]))
})

test("a broken relative link is reported with its file", () => {
  fixture({ "docs/guide.md": "See [gone](missing.md) and [ok](../README.md#top).\n" }, (root) =>
    expect(checkDocs(root)).toEqual(["docs/guide.md: broken link 'missing.md' (no such file: docs/missing.md)"]))
})

test("links inside fenced code blocks are not checked", () => {
  fixture({ "docs/guide.md": "```md\n[x](nope.md)\n```\n" }, (root) => expect(checkDocs(root)).toEqual([]))
})

test("a stale version inside a fenced command example is still reported", () => {
  fixture({ "docs/guide.md": "```sh\njustjs toolchain pin justw 0.1.1 abc\n```\n" }, (root) =>
    expect(checkDocs(root)).toEqual(["docs/guide.md: says justw 0.1.1 but the pin is 0.1.2"]))
})

for (const [what, text, expected] of [
  ["justw", "Pinned: justw `0.1.1`.", "docs/guide.md: says justw 0.1.1 but the pin is 0.1.2"],
  ["Rust", "Built with Rust 1.85.0.", "docs/guide.md: says Rust 1.85.0 but the pin is 1.99.1"],
  ["Bun", "Needs Bun **1.3.0**.", "docs/guide.md: says Bun 1.3.0 but the pin is 1.4.2"],
] as const) {
  test(`a stale ${what} version in prose is reported`, () => {
    fixture({ "docs/guide.md": text + "\n" }, (root) => expect(checkDocs(root)).toEqual([expected]))
  })
}

test("a stale generator_revision or justweb-dev commit in prose is reported", () => {
  fixture({ "docs/guide.md": "generator_revision = \"64eb51bf4d471261053f6d08dac6db5ce613abd8\"\nCLI from justweb-dev c7e5ed7e9268c7884edc8938c9bb50d7a1caf629.\n" }, (root) =>
    expect(checkDocs(root)).toEqual([
      `docs/guide.md: generator_revision 64eb51bf4d471261053f6d08dac6db5ce613abd8 is not the pinned ${REV}`,
      `docs/guide.md: justweb-dev ref c7e5ed7e9268c7884edc8938c9bb50d7a1caf629 is not the CI checkout ${CLI}`,
    ]))
})

test("a correct abbreviated revision and CLI commit are accepted", () => {
  fixture({ "docs/guide.md": "generator_revision 4d2828d. CLI at justweb-dev 5db7d42.\n" }, (root) => expect(checkDocs(root)).toEqual([]))
})

test("history files keep old versions but their links are still checked", () => {
  fixture({ "docs/e2e-validation.md": "Old run used justw 0.1.0 and Rust 1.80.0. See [x](gone.md).\n" }, (root) =>
    expect(checkDocs(root)).toEqual(["docs/e2e-validation.md: broken link 'gone.md' (no such file: docs/gone.md)"]))
})

test("examples that disagree on the justw pin are reported", () => {
  fixture({ "scm/examples/two/justjs.config.toml": config("0.1.1") }, (root) =>
    expect(checkDocs(root).some((e) => e.startsWith("examples disagree on the justw pin"))).toBe(true))
})

test("a half-declared pin is reported", () => {
  fixture({ "scm/examples/two/justjs.config.toml": '[justweb]\ngenerator_version = "0.1.2"\n' }, (root) =>
    expect(checkDocs(root)).toContain("scm/examples/two/justjs.config.toml: generator_version and a 40-character generator_revision are both required"))
})

test("CI building justw from a different commit than the examples pin is reported", () => {
  fixture({ ".github/workflows/ci.yml": ci({ generatorRef: "0".repeat(40) }) }, (root) =>
    expect(checkDocs(root)).toEqual([`ci.yml builds justw from ${"0".repeat(40)} but the examples pin generator_revision ${REV}`]))
})

test("a floating Rust toolchain in CI is reported", () => {
  fixture({ ".github/workflows/ci.yml": ci({ rust: "stable" }) }, (root) =>
    expect(checkDocs(root)).toEqual(["ci.yml must pin exactly one exact Rust toolchain (dtolnay/rust-toolchain@X.Y.Z), found: stable"]))
})
