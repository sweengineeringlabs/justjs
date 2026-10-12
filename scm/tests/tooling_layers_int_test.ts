import { expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { checkToolingLayers } from "../../scripts/ci/check-tooling-layers.js"

function fixture(files: Record<string, string>, check: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "justjs-layer-test-"))
  try {
    const contents = {
      "package.json": JSON.stringify({ workspaces: ["tooling/sample"] }),
      "tooling/sample/package.json": JSON.stringify({ name: "@test/sample", justjsLayers: {
        core: ["src/core/**/*.ts"], spi: ["src/spi/**/*.ts"], api: ["src/api/**/*.ts"],
      } }),
      "tooling/sample/tsconfig.json": JSON.stringify({ compilerOptions: {
        module: "NodeNext", moduleResolution: "NodeNext", baseUrl: ".", paths: { "@core/*": ["src/core/*"] },
      } }),
      "tooling/sample/src/api/service.ts": "export interface Service { run(): string }",
      "tooling/sample/src/core/service.ts": 'import type { Service } from "../api/service.js"; export const service: Service = { run: () => "core" }',
      "tooling/sample/src/spi/service.ts": 'import type { Service } from "../api/service.js"; export const service: Service = { run: () => "spi" }',
      ...files,
    }
    for (const [path, content] of Object.entries(contents)) {
      const target = join(root, path)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, content)
    }
    check(root)
  } finally {
    if (!root.startsWith(join(tmpdir(), "justjs-layer-test-"))) throw new Error("Unsafe fixture cleanup path")
    rmSync(root, { recursive: true, force: true })
  }
}

test("independent core and SPI implementations may share the API", () => {
  fixture({}, (root) => expect(checkToolingLayers(root)).toEqual([]))
})

for (const code of [
  'import "../spi/service.js"',
  'export { service } from "../spi/service.js"',
  'import type { Service } from "../spi/service.js"',
  'void import("../spi/service.js")',
  'require("../spi/service.js")',
  'import "left-pad"',
  'import "node:fs"',
  'import "../saf/index.js"',
  'const native = Bun.TOML.parse("key = 1")',
  'const native = globalThis["Bun"]',
  'void import(computedPath)',
]) {
  test(`core dependency constraint rejects ${code}`, () => {
    fixture({ "tooling/sample/src/core/violation.ts": code }, (root) => {
      expect(checkToolingLayers(root).join("\n")).toContain("core")
      expect(checkToolingLayers(root).length).toBeGreaterThan(0)
    })
  })
}

test.each(['../core/service.js', '@core/service', '@test/sample'])("SPI cannot depend on core via %s", (specifier) => {
  fixture({
    "tooling/sample/src/spi/violation.ts": `import "${specifier}"`,
    "tooling/sample/src/saf/index.ts": 'export { service } from "../core/service.js"',
  }, (root) => expect(checkToolingLayers(root).join("\n")).toContain("spi must not depend on core"))
})

test("API intermediaries cannot hide runtime dependencies from core", () => {
  fixture({ "tooling/sample/src/api/service.ts": 'import "left-pad"; export interface Service { run(): string }' }, (root) => {
    expect(checkToolingLayers(root).join("\n")).toContain("forbidden 'left-pad'")
  })
})

test("a dependency added to a core package manifest fails the build check", () => {
  fixture({ "tooling/sample/src/core/package.json": '{"dependencies":{"left-pad":"1.0.0"}}' }, (root) => {
    expect(checkToolingLayers(root).join("\n")).toContain("core must declare zero external dependencies")
    const script = resolve(import.meta.dir, "../../scripts/ci/check-tooling-layers.ts")
    const child = Bun.spawnSync([process.execPath, script, root])
    expect(child.exitCode).toBe(1)
    expect(new TextDecoder().decode(child.stderr)).toContain("zero external dependencies")
  })
})
