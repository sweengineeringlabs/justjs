import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"

// Exercise built public exports in a real Node process without Bun globals.
// Run after `bun run build` (library output is required).
for (const [name, expression] of [
  ["vite", 'module.parseToml("key = 1")'],
  ["build", 'module.extractImportsFromCode("import \'example\'")'],
  ["html", 'module.escapeHtml("<text>")'],
  ["ssr", 'module.escapeHtml("<text>")'],
] as const) {
  test(`${name} reports the Bun requirement under Node`, () => {
    const url = new URL(`../../tooling/${name}/scm/main/dist/saf/index.js`, import.meta.url).href
    const script = `
      const module = await import(${JSON.stringify(url)});
      try { ${expression}; process.exitCode = 2; }
      catch (error) {
        if (!error.message.includes("requires Bun >=1.4.2")) throw error;
        console.log(error.message);
      }
    `
    const result = spawnSync("node", ["--input-type=module", "-e", script], { encoding: "utf8" })
    expect(result.error).toBeUndefined()
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("requires Bun >=1.4.2")
  })
}

for (const [name, expression, expected] of [
  ["vite", 'module.parseToml(\'url = "https://example.com/?key=value"\', "core").url', "https://example.com/?key=value"],
  ["build", 'module.extractImportsFromCode(\'// import "fake"\\nimport("real")\', "core")', ["real"]],
  ["html", 'module.escapeHtml("<text>", "core")', "&lt;text&gt;"],
  ["ssr", 'module.escapeHtml("<text>", "core")', "&lt;text&gt;"],
] as const) {
  test(`${name} supports the shipped core strategy under Node`, () => {
    const url = new URL(`../../tooling/${name}/scm/main/dist/saf/index.js`, import.meta.url).href
    const result = spawnSync("node", ["--input-type=module", "-e", `
      import assert from "node:assert/strict";
      const module = await import(${JSON.stringify(url)});
      assert.deepEqual(${expression}, ${JSON.stringify(expected)});
    `], { encoding: "utf8" })
    expect(result.error).toBeUndefined()
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
  })
}

test("Node can select an alternate provider without invoking Bun", () => {
  const app = new URL("../../application/scm/main/dist/saf/index.js", import.meta.url).href
  const html = new URL("../../tooling/html/scm/main/dist/saf/index.js", import.meta.url).href
  const result = spawnSync("node", ["--input-type=module", "-e", `
    const { justjs } = await import(${JSON.stringify(app)});
    const { escapeHtml } = await import(${JSON.stringify(html)});
    justjs.providers.register({ concern: "htmlEscaper", strategy: "node-fixture", factory: () => ({ escape: () => "alternate" }) });
    if (escapeHtml("input", "node-fixture") !== "alternate") process.exitCode = 1;
  `], { encoding: "utf8" })
  expect(result.error).toBeUndefined()
  expect(result.stderr).toBe("")
  expect(result.status).toBe(0)
})
