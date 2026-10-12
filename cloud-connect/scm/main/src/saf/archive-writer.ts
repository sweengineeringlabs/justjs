import { DefaultArchiveWriter } from "../core/tar_writer.js";
import { justjs } from "@justjs/application";
import type { ArchiveWriter } from "../api/archive-writer.js";
export type { ArchiveWriter } from "../api/archive-writer.js";

justjs.providers.register({ concern: "archiveWriter", strategy: "core", factory: () => new DefaultArchiveWriter() });

export function createArchiveWriter(strategy: string): ArchiveWriter {
  const spec = justjs.providers.resolve("archiveWriter", strategy);
  if (!spec) throw new Error(`Unknown archive writer strategy "${strategy}".`);
  return spec.factory() as ArchiveWriter;
}
