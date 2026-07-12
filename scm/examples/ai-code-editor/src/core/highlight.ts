// Lightweight regex tokenizer, not a real parser - good enough for a
// visual approximation, and proven safe to compile through justc for the
// Android target (the same technique, `text.match(/pattern/g)`, already
// ships in @justjs/memory's fake_embedding.ts). A real tokenizer/AST
// (e.g. CodeMirror) was ruled out for v1: no example app in this
// ecosystem has ever pulled a third-party npm dependency through justc,
// and two real open justc bugs (--bundle a no-op for --target js,
// non-JS/TS imports silently dropped) make that a genuinely untested
// risk for a multi-package dependency graph like CodeMirror's.
const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "class", "extends", "import", "export", "from", "default", "new",
  "this", "async", "await", "try", "catch", "finally", "throw", "typeof",
  "instanceof", "in", "of", "switch", "case", "break", "continue", "null",
  "undefined", "true", "false", "interface", "type", "enum", "public",
  "private", "protected", "readonly", "static", "void", "as", "def",
  "elif", "None", "True", "False", "print", "lambda", "fn", "impl",
  "struct", "pub", "match", "mod", "use", "trait", "package", "func",
  "defer", "go", "chan", "select", "range", "map",
]);

const TOKEN_PATTERN =
  /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|(#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlight(code: string): string {
  let result = "";
  let lastIndex = 0;
  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(code)) !== null) {
    result += escapeHtml(code.slice(lastIndex, match.index));
    const full = match[0]!;
    const [, lineComment, blockComment, hashComment, str, num, word] = match;
    if (lineComment || blockComment || hashComment) {
      result += `<span class="tok-comment">${escapeHtml(full)}</span>`;
    } else if (str) {
      result += `<span class="tok-string">${escapeHtml(full)}</span>`;
    } else if (num) {
      result += `<span class="tok-number">${escapeHtml(full)}</span>`;
    } else if (word && KEYWORDS.has(word)) {
      result += `<span class="tok-keyword">${escapeHtml(full)}</span>`;
    } else {
      result += escapeHtml(full);
    }
    const matchEnd = match.index + full.length;
    lastIndex = matchEnd;
  }
  result += escapeHtml(code.slice(lastIndex));
  return result;
}
