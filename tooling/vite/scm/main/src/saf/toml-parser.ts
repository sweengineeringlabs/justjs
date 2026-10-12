import "../spi/bun-toml-parser/index.js"
import { justjs } from "@justjs/application"
import type { ParsedToml, TomlParser } from "../api/toml-parser.js"
import { DefaultTomlParser } from "../core/toml-parser.js"
export type { ParsedToml, TomlParser } from "../api/toml-parser.js"

justjs.providers.register({ concern: "tomlParser", strategy: "core", factory: () => new DefaultTomlParser() })

export function createTomlParser(strategy: string): TomlParser {
  const spec = justjs.providers.resolve("tomlParser", strategy)
  if (!spec) throw new Error(`Unknown TOML parser strategy "${strategy}".`)
  return spec.factory() as TomlParser
}

export function parseToml(content: string, strategy = "bun"): ParsedToml {
  return createTomlParser(strategy).parse(content)
}
