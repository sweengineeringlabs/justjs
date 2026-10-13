import { resolve, join } from "node:path";

// Build the workspace first: example packages consume its compiled SAF exports.
// Run from src to exercise upward project discovery on every command.
const failures: string[] = [];
for (const app of ["hello-justjs", "cross-target-demo", "agentic-memory-demo", "ai-code-editor"]) {
  const cwd = resolve("scm/examples", app, "src");
  for (const args of [
    ["toolchain", "install"], ["toolchain", "install"], ["toolchain", "list"],
    ["generate"], ["check"], ["typecheck"], ["build"],
  ]) {
    const child = Bun.spawn(["justjs", ...args], { cwd, stdout: "inherit", stderr: "inherit" });
    const label = `${app}: justjs ${args.join(" ")}`;
    if (await child.exited !== 0) {
      failures.push(label);
      console.error(`FAIL ${label}`);
    } else console.log(`PASS ${label}`);
  }
  if (!(await Bun.file(join(cwd, "../dist-cli/index.html")).exists())) {
    throw new Error(`${app}: CLI build did not emit the page`);
  }
}
if (failures.length) throw new Error(`CLI workflow failures:\n${failures.join("\n")}`);
