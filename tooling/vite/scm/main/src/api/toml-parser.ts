export interface ParsedToml {
  readonly [key: string]: unknown
}

export interface TomlParser {
  parse(content: string): ParsedToml
}
