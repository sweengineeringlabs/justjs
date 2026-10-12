import { justjs } from "@justjs/application"
import type { ImportScanner } from "../../api/import-scanner.js"

export class BunTranspiler implements ImportScanner {
  private readonly transpiler: InstanceType<typeof Bun.Transpiler>

  constructor() {
    if (typeof Bun === "undefined" || typeof Bun.Transpiler !== "function") {
      throw new Error('Import scanner strategy "bun" requires Bun >=1.4.2. Run build tooling with bun, or register and select another ImportScanner strategy.')
    }
    this.transpiler = new Bun.Transpiler({ loader: "ts" })
  }

  scan(code: string): string[] {
    return [...new Set(this.transpiler.scanImports(code)
      .filter((entry) => entry.kind === "import-statement" || entry.kind === "dynamic-import")
      .map((entry) => entry.path)
      .filter((path) => !path.startsWith(".")))].sort()
  }
}

justjs.providers.register({ concern: "importScanner", strategy: "bun", factory: () => new BunTranspiler() })
