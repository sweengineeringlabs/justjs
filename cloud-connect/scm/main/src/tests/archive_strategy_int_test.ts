import { expect, test } from "bun:test";
import { justjs } from "@justjs/application";
import { createArchiveWriter } from "../saf/archive-writer.js";

test("core archive produces readable gzip tar with nested UTF-8 files", async () => {
  const files = [{ path: "nested/hello.txt", content: "Hello 雪" }, { path: "empty.txt", content: "" }];
  const bytes = await createArchiveWriter("core").write(files);
  // Independent test decoder; Bun is never a deployment dependency.
  const entries = await new Bun.Archive(bytes).files();
  for (const file of files) expect(await entries.get(file.path)?.text()).toBe(file.content);
  expect(entries.size).toBe(2);
});

test("archive implementation switches by strategy name", async () => {
  justjs.providers.register({ concern: "archiveWriter", strategy: "fixture", factory: () => ({ write: async () => new Uint8Array([42]) }) });
  expect(await createArchiveWriter("fixture").write([])).toEqual(new Uint8Array([42]));
  expect(() => createArchiveWriter("missing")).toThrow('Unknown archive writer strategy "missing"');
});
