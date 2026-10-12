import "../spi/bun-transpiler/index.js"
import { justjs } from "@justjs/application"
import type { ImportScanner } from "../api/import-scanner.js"
import { DefaultImportScanner } from "../core/import-scanner.js"
export type { ImportScanner } from "../api/import-scanner.js"

justjs.providers.register({ concern: "importScanner", strategy: "core", factory: () => new DefaultImportScanner() })

export function createImportScanner(strategy: string): ImportScanner {
  const spec = justjs.providers.resolve("importScanner", strategy)
  if (!spec) throw new Error(`Unknown import scanner strategy "${strategy}".`)
  return spec.factory() as ImportScanner
}
