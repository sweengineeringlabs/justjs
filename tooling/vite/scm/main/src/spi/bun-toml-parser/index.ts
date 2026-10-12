import { justjs } from "@justjs/application"
import type { ParsedToml, TomlParser } from "../../api/toml-parser.js"

export class BunTomlParser implements TomlParser {
  constructor() {
    if (typeof Bun === "undefined" || typeof Bun.TOML?.parse !== "function") {
      throw new Error('TOML strategy "bun" requires Bun >=1.4.2. Run code generation with bun, or register and select another TomlParser strategy.')
    }
  }

  parse(content: string): ParsedToml {
    return Bun.TOML.parse(content) as ParsedToml
  }
}

justjs.providers.register({ concern: "tomlParser", strategy: "bun", factory: () => new BunTomlParser() })
