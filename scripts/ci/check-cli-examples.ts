import { resolve, join } from "node:path";

// Build the workspace first: example packages consume its compiled SAF exports.
// Run from src to exercise upward project discovery on every command.
for (const app of ["hello-justjs", "cross-target-demo", "agentic-memory-demo", "ai-code-editor"]) {
  const cwd = resolve("scm/examples", app, "src");
  for (const args of [
    ["toolchain", "install"], ["toolchain", "install"], ["toolchain", "list"],
    ["generate"], ["check"], ["typecheck"], ["build"],
  ]) {
    const child = Bun.spawn(["justjs", ...args], { cwd, stdout: "inherit", stderr: "inherit" });
    if (await child.exited !== 0) throw new Error(`${app}: justjs ${args.join(" ")} failed`);
    console.log(`PASS ${app}: justjs ${args.join(" ")}`);
  }
  if (!(await Bun.file(join(cwd, "../dist-cli/index.html")).exists())) {
    throw new Error(`${app}: CLI build did not emit the page`);
  }
}
