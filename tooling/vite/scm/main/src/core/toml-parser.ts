import type { ParsedToml, TomlParser } from "../api/toml-parser.js"

type Table = Record<string, unknown>

/** Dependency-free parser for the TOML configuration subset used by JustJS. */
export class DefaultTomlParser implements TomlParser {
  parse(content: string): ParsedToml {
    return new Reader(content.replace(/\r\n/g, "\n")).parse()
  }
}

export function parseToml(content: string): ParsedToml {
  return new DefaultTomlParser().parse(content)
}

class Reader {
  private offset = 0
  private readonly root: Table = {}
  private readonly declared = new Set<Table>()

  constructor(private readonly source: string) {}

  private fail(message: string): never {
    const line = this.source.slice(0, this.offset).split("\n").length
    throw new SyntaxError(`TOML line ${line}: ${message}`)
  }

  private peek(): string { return this.source[this.offset] ?? "" }

  private whitespace(newlines = false): void {
    while (this.offset < this.source.length) {
      if (this.peek() === " " || this.peek() === "\t" || (newlines && this.peek() === "\n")) this.offset++
      else if (this.peek() === "#") {
        while (this.offset < this.source.length && this.peek() !== "\n") this.offset++
      } else break
    }
  }

  private expect(character: string): void {
    if (this.peek() !== character) this.fail(`expected '${character}'`)
    this.offset++
  }

  private set(table: Table, key: string, value: unknown): void {
    if (Object.hasOwn(table, key)) this.fail(`duplicate key '${key}'`)
    Object.defineProperty(table, key, { value, enumerable: true, writable: true, configurable: true })
  }

  private table(parent: Table, key: string): Table {
    if (!Object.hasOwn(parent, key)) this.set(parent, key, {})
    const value = parent[key]
    if (!value || typeof value !== "object" || Array.isArray(value)) this.fail(`'${key}' is not a table`)
    return value as Table
  }

  private keys(): string[] {
    const keys: string[] = []
    do {
      this.whitespace()
      if (this.peek() === '"' || this.peek() === "'") keys.push(this.string(false))
      else {
        const start = this.offset
        while (this.peek() && /[A-Za-z0-9_-]/.test(this.peek())) this.offset++
        if (start === this.offset) this.fail("expected a key")
        keys.push(this.source.slice(start, this.offset))
      }
      this.whitespace()
      if (this.peek() !== ".") break
      this.offset++
    } while (true)
    return keys
  }

  private assign(table: Table): void {
    const keys = this.keys()
    this.expect("=")
    this.whitespace()
    const value = this.value()
    for (const key of keys.slice(0, -1)) table = this.table(table, key)
    this.set(table, keys[keys.length - 1]!, value)
  }

  parse(): Table {
    let current = this.root
    while (this.offset < this.source.length) {
      this.whitespace(true)
      if (this.offset === this.source.length) break
      if (this.peek() === "[") {
        this.offset++
        if (this.peek() === "[") this.fail('array tables are unsupported by strategy "core"; select "bun"')
        const keys = this.keys()
        this.expect("]")
        current = this.root
        for (const key of keys) current = this.table(current, key)
        if (this.declared.has(current)) this.fail("duplicate table")
        this.declared.add(current)
      } else this.assign(current)
      this.whitespace()
      if (this.offset < this.source.length) this.expect("\n")
    }
    return this.root
  }

  private string(allowMultiline = true): string {
    const quote = this.peek()
    this.offset++
    const multiline = allowMultiline && this.source.slice(this.offset, this.offset + 2) === quote.repeat(2)
    if (multiline) {
      this.offset += 2
      if (this.peek() === "\n") this.offset++
    }
    let result = ""
    while (this.offset < this.source.length) {
      const character = this.peek()
      if (character === quote && (!multiline || this.source.slice(this.offset, this.offset + 3) === quote.repeat(3))) {
        this.offset += multiline ? 3 : 1
        return result
      }
      this.offset++
      if (!multiline && character === "\n") this.fail("newline in a single-line string")
      if (character < " " && character !== "\t" && character !== "\n") this.fail("control character in string")
      if (quote === '"' && character === "\\") {
        const escaped = this.peek()
        this.offset++
        const escapes: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" }
        if (Object.hasOwn(escapes, escaped)) result += escapes[escaped]
        else if (escaped === "u" || escaped === "U") {
          const length = escaped === "u" ? 4 : 8
          const digits = this.source.slice(this.offset, this.offset + length)
          if (!new RegExp(`^[0-9a-fA-F]{${length}}$`).test(digits)) this.fail("invalid Unicode escape")
          const code = Number.parseInt(digits, 16)
          if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) this.fail("invalid Unicode scalar")
          result += String.fromCodePoint(code)
          this.offset += length
        } else if (multiline && /\s/.test(escaped)) {
          while (this.peek() && /\s/.test(this.peek())) this.offset++
        } else this.fail("invalid string escape")
      } else result += character
    }
    return this.fail("unterminated string")
  }

  private value(): unknown {
    if (this.peek() === '"' || this.peek() === "'") return this.string()
    if (this.peek() === "[") {
      this.offset++
      const values: unknown[] = []
      this.whitespace(true)
      while (this.peek() !== "]") {
        values.push(this.value())
        this.whitespace(true)
        if (this.peek() === "]") break
        this.expect(",")
        this.whitespace(true)
      }
      this.expect("]")
      return values
    }
    if (this.peek() === "{") {
      this.offset++
      const table: Table = {}
      this.whitespace()
      while (this.peek() !== "}") {
        this.assign(table)
        this.whitespace()
        if (this.peek() === "}") break
        this.expect(",")
        this.whitespace()
        if (this.peek() === "}") this.fail("trailing comma in inline table")
      }
      this.expect("}")
      return table
    }
    const start = this.offset
    while (this.peek() && !/[\s,#\]}]/.test(this.peek())) this.offset++
    const token = this.source.slice(start, this.offset)
    if (token === "true" || token === "false") return token === "true"
    if (/^[+-]?(inf|nan)$/.test(token)) return token.endsWith("nan") ? NaN : token.startsWith("-") ? -Infinity : Infinity
    const decimal = "(?:0|[1-9](?:_?[0-9])*)"
    const numberPattern = new RegExp(`^[+-]?${decimal}(?:\\.[0-9](?:_?[0-9])*)?(?:[eE][+-]?[0-9](?:_?[0-9])*)?$`)
    if (numberPattern.test(token) || /^0(?:x[0-9a-fA-F](?:_?[0-9a-fA-F])*|o[0-7](?:_?[0-7])*|b[01](?:_?[01])*)$/.test(token)) {
      const value = Number(token.replace(/_/g, ""))
      if (!token.includes(".") && !/[eE]/.test(token) && !Number.isSafeInteger(value)) this.fail("integer exceeds safe range")
      return value
    }
    return this.fail(`invalid or unsupported value '${token}'; select strategy "bun" for full TOML support`)
  }
}
