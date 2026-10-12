import type { CloudDeployFile } from "./provider.js";

export interface ArchiveWriter {
  write(files: readonly CloudDeployFile[]): Promise<Uint8Array>;
}
