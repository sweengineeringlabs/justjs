import type { ImportScanner } from "../api/import-scanner.js"

interface Token { kind: "word" | "string" | "punct"; value: string }

// Tokenize before inspecting module declarations: comments, quoted text,
// templates and regular expressions must not manufacture import statements.
function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let offset = 0
  const emit = (kind: Token["kind"], value: string) => tokens.push({ kind, value })
  const previous = () => tokens[tokens.length - 1]
  const regexKeywords = new Set(["return", "throw", "case", "delete", "void", "typeof", "yield", "await", "in", "of", "else", "do"])
  const controlKeywords = new Set(["if", "while", "for", "with", "switch", "catch"])
  const parentheses: boolean[] = []
  let afterControl = false

  function string(quote: string): string {
    offset++
    let value = ""
    while (offset < source.length) {
      const character = source[offset++]!
      if (character === quote) return value
      if (character !== "\\") { value += character; continue }
      const escaped = source[offset++] ?? ""
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v", "0": "\0" }
      if (escaped === "\n") continue
      if (escaped === "\r") { if (source[offset] === "\n") offset++; continue }
      if (escaped === "x" || escaped === "u") {
        const braces = escaped === "u" && source[offset] === "{"
        if (braces) offset++
        const end = braces ? source.indexOf("}", offset) : offset + (escaped === "x" ? 2 : 4)
        const digits = source.slice(offset, end)
        if (end < offset || !/^[\da-fA-F]+$/.test(digits)) throw new SyntaxError("Invalid module string escape")
        value += String.fromCodePoint(Number.parseInt(digits, 16))
        offset = end + (braces ? 1 : 0)
      } else value += escapes[escaped] ?? escaped
    }
    throw new SyntaxError("Unterminated JavaScript string")
  }

  function template(): void {
    offset++
    emit("punct", "`")
    while (offset < source.length) {
      const character = source[offset++]
      if (character === "\\") { offset++; continue }
      if (character === "`") { emit("punct", "`"); return }
      if (character === "$" && source[offset] === "{") {
        offset++
        emit("punct", "{")
        scan(true)
      }
    }
    throw new SyntaxError("Unterminated template literal")
  }

  function scan(interpolation = false): void {
    let braces = 0
    while (offset < source.length) {
      const character = source[offset]!
      if (/\s/.test(character)) { offset++; continue }
      if (source.startsWith("//", offset) || (offset === 0 && source.startsWith("#!"))) {
        while (offset < source.length && source[offset] !== "\n") offset++
        continue
      }
      if (source.startsWith("/*", offset)) {
        const end = source.indexOf("*/", offset + 2)
        if (end < 0) throw new SyntaxError("Unterminated JavaScript comment")
        offset = end + 2
        continue
      }
      if (character === '"' || character === "'") { emit("string", string(character)); afterControl = false; continue }
      if (character === "`") { template(); afterControl = false; continue }
      const last = previous()
      const canStartRegex = !last || afterControl || regexKeywords.has(last.value) || (last.kind === "punct" && !["}", ")", "]", "`", ".", "++", "--"].includes(last.value))
      if (character === "/" && canStartRegex) {
        offset++
        let inClass = false
        let closed = false
        while (offset < source.length) {
          const part = source[offset++]
          if (part === "\\") { offset++; continue }
          if (part === "[") inClass = true
          if (part === "]") inClass = false
          if (part === "/" && !inClass) { closed = true; break }
          if (part === "\n") break
        }
        if (!closed) throw new SyntaxError("Unterminated JavaScript regular expression")
        while (/[a-z]/i.test(source[offset] ?? "") && offset < source.length) offset++
        emit("word", "<regex>")
        afterControl = false
        continue
      }
      if (/[\w$]/.test(character)) {
        const start = offset++
        while (offset < source.length && /[\w$]/.test(source[offset]!)) offset++
        emit("word", source.slice(start, offset))
        afterControl = false
        continue
      }
      offset++
      if (character === "(") parentheses.push(!!last && controlKeywords.has(last.value))
      afterControl = character === ")" && (parentheses.pop() ?? false)
      if (character === "{") braces++
      if (character === "}" && interpolation && braces-- === 0) { emit("punct", "}"); return }
      const doubled = (character === "+" || character === "-") && source[offset] === character
      if (doubled) offset++
      emit("punct", doubled ? character.repeat(2) : character)
    }
  }
  scan()
  return tokens
}

function hasRuntimeBinding(clause: Token[]): boolean {
  if (clause.length > 1 && clause[0]?.value === "type" && clause[1]?.value !== ",") return false
  if (clause[0]?.value !== "{") return true
  const fields: Token[][] = [[]]
  for (const token of clause.slice(1, -1)) {
    if (token.value === ",") fields.push([])
    else fields[fields.length - 1]!.push(token)
  }
  return fields.some((field) => field.length > 0 && (field[0]?.value !== "type" || field.length === 1 || field[1]?.value === "as"))
}

export class DefaultImportScanner implements ImportScanner {
  scan(code: string): string[] {
    const tokens = tokenize(code)
    const imports = new Set<string>()
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!
      if (token.kind !== "word" || !["import", "export"].includes(token.value) || tokens[i - 1]?.value === ".") continue
      const next = tokens[i + 1]
      if (token.value === "import" && next?.value === "(") {
        const argument = tokens[i + 2]
        if (argument?.kind === "string" && [")", ","].includes(tokens[i + 3]?.value ?? "")) imports.add(argument.value)
        continue
      }
      if (token.value === "import" && next?.kind === "string") { imports.add(next.value); continue }
      if (!next || next.value === "." || next.value === "(") continue
      // Only declaration forms can have a module clause. Never scan an export
      // function's body or a default-exported expression looking for `from`.
      if (token.value === "export" && !["{", "*", "type"].includes(next.value)) continue
      let depth = 0
      for (let j = i + 1; j < tokens.length; j++) {
        const item = tokens[j]!
        if (item.value === "{") depth++
        if (item.value === "}") depth--
        if (depth === 0 && item.value === "from" && tokens[j + 1]?.kind === "string") {
          if (hasRuntimeBinding(tokens.slice(i + 1, j))) imports.add(tokens[j + 1]!.value)
          break
        }
        if (depth === 0 && [";", "import", "export", "="].includes(item.value)) break
      }
    }
    return [...imports].filter((path) => !path.startsWith(".")).sort()
  }
}
