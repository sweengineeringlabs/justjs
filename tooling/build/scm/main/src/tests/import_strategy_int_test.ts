import { expect, test } from "bun:test"
import { justjs } from "@justjs/application"
import { createImportScanner, extractImportsFromCode, generateBundleResult } from "../saf/index.js"

test("import scanning uses the selected strategy through bundle validation", () => {
  justjs.providers.register({ concern: "importScanner", strategy: "fixture", factory: () => ({ scan: () => ["fixture-package"] }) })
  expect(extractImportsFromCode("opaque input", "fixture")).toEqual(["fixture-package"])
  expect(generateBundleResult("opaque input", { imports: { "fixture-package": "/fixture.js" } }, "fixture").importsUsed).toEqual(["fixture-package"])
  expect(() => createImportScanner("missing")).toThrow('Unknown import scanner strategy "missing"')
})

test.each(["core", "bun"])("%s import policy covers exports, types, require, computed imports and sorting", (strategy) => {
  const code = `
    // import "comment"
    const text = 'import "string-literal"';
    import type { SomeType } from "types-only";
    export type { OtherType } from "exported-types";
    export { value } from "z-package";
    export * from "a-package";
    import "z-package";
    import("dynamic-package");
    import("./relative.js");
    import("../parent.js");
    require("commonjs-package");
    import(variable);
  `
  expect(extractImportsFromCode(code, strategy)).toEqual(["a-package", "dynamic-package", "z-package"])
})
