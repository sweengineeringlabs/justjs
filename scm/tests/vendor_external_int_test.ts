import { describe, it, expect } from "bun:test"
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

// justjs#40: proves scm/vendor-external.sh's whole promise for real - not
// just that it exits 0, but that the tarballs it produces are genuinely
// installable via plain `npm install` (no bun, no workspace:*) in a
// directory that is not a member of this bun workspace, and that the
// installed package's real code executes correctly once imported - a bare
// successful `import` proves module resolution, not that the shipped
// code actually does anything.
describe("scm/vendor-external.sh (justjs#40 external consumption)", () => {
  it(
    "test_vendored_tarballs_install_via_plain_npm_and_execute_real_logic_correctly",
    () => {
      const repoRoot = join(import.meta.dir, "..", "..")
      const consumerDir = mkdtempSync(join(tmpdir(), "justjs-external-consumer-"))
      const vendorDir = join(consumerDir, "vendor")

      try {
        const vendorResult = Bun.spawnSync(
          ["bash", "scm/vendor-external.sh", vendorDir, "@justjs/application", "@justjs/platform-mobile"],
          { cwd: repoRoot }
        )
        expect(vendorResult.exitCode).toBe(0)

        const fragmentPath = join(vendorDir, "package-fragment.json")
        expect(existsSync(fragmentPath)).toBe(true)
        const fragment = JSON.parse(readFileSync(fragmentPath, "utf-8")) as {
          dependencies: Record<string, string>
          overrides: Record<string, string>
        }

        // The full transitive closure - application declares transport/
        // network/data as dependencies, platform-mobile declares
        // application - all resolved automatically by the script, not
        // enumerated here by hand (that's the exact behavior under test).
        expect(Object.keys(fragment.dependencies).sort()).toEqual(
          ["@justjs/application", "@justjs/data", "@justjs/network", "@justjs/platform-mobile", "@justjs/transport"].sort()
        )

        for (const tarball of Object.values(fragment.dependencies)) {
          const path = tarball.replace(/^file:/, "")
          expect(existsSync(join(vendorDir, "..", path))).toBe(true)
        }

        writeFileSync(
          join(consumerDir, "package.json"),
          JSON.stringify(
            {
              name: "vendor-external-int-test-consumer",
              private: true,
              version: "1.0.0",
              type: "module",
              dependencies: fragment.dependencies,
              overrides: fragment.overrides,
            },
            null,
            2
          )
        )

        const installResult = Bun.spawnSync(["npm", "install"], { cwd: consumerDir })
        if (installResult.exitCode !== 0) {
          throw new Error(`npm install failed:\n${installResult.stderr.toString()}`)
        }
        expect(installResult.exitCode).toBe(0)

        // Real functional exercise, not just "the import resolved" - a
        // deliberately invalid boot() config must throw the real, specific
        // BootError, and the platform-mobile adapter's mount()/unmount()
        // must actually run, proving the shipped code executes correctly
        // under plain node with no bun/workspace resolution involved.
        const testScript = `
import { justjs, BootError } from "@justjs/application";
import { createJsRuntimeShellAdapter } from "@justjs/platform-mobile";

let threw = false;
try {
  await justjs.boot({
    routes: ["/", "/missing"],
    registry: { "x-root": { path: "/", component: "Root" } },
  });
} catch (e) {
  threw = true;
  if (!(e instanceof BootError) || e.code !== "ROUTE_NOT_IN_REGISTRY") {
    console.error("FAIL:boot-error:" + String(e));
    process.exit(1);
  }
}
if (!threw) {
  console.error("FAIL:boot-did-not-throw");
  process.exit(1);
}

const adapter = createJsRuntimeShellAdapter();
const handle = adapter.mount("app:home:x-widget:root", { tagName: "div" });
if (typeof handle.unmount !== "function") {
  console.error("FAIL:mount-handle");
  process.exit(1);
}
handle.unmount();

console.log("VENDOR_EXTERNAL_TEST_OK");
`
        const testScriptPath = join(consumerDir, "run_test.mjs")
        writeFileSync(testScriptPath, testScript)

        const runResult = Bun.spawnSync(["node", "run_test.mjs"], { cwd: consumerDir })
        const stdout = runResult.stdout.toString()
        const stderr = runResult.stderr.toString()
        if (runResult.exitCode !== 0) {
          throw new Error(`consumer script failed (exit ${runResult.exitCode}):\nstdout: ${stdout}\nstderr: ${stderr}`)
        }
        expect(stdout).toContain("VENDOR_EXTERNAL_TEST_OK")
      } finally {
        rmSync(consumerDir, { recursive: true, force: true })
      }
    },
    120_000
  )
})
