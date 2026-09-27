export interface ParsedToml {
  readonly [key: string]: unknown
}

export function parseToml(content: string): ParsedToml {
  if (!content.trim()) return {}
  return Bun.TOML.parse(content) as ParsedToml
}
