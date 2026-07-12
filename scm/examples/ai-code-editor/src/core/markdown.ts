// A bounded, hand-rolled Markdown-to-HTML converter - headers, bold/
// italic, inline code, fenced code blocks, lists, links, paragraphs.
// A real but intentionally limited subset, not a full CommonMark
// implementation - same honesty core/highlight.ts's own "regex
// tokenizer, not a real parser" comment already establishes for syntax
// highlighting. The source this renders is LLM-generated
// (AiAssistProvider.generateDesignDoc()) - treated as untrusted the same
// way any external input would be: every piece of text is escaped
// exactly once, at the point it's inserted into HTML, in the context it
// actually needs (text node vs. an href attribute), never escaped-then-
// regexed (which would either double-escape or let markdown syntax
// characters inside already-escaped entities confuse the parser).
//
// Fenced ```mermaid blocks are routed through a real Mermaid.js render
// instead of being shown as plain code - see renderMermaidBlock()'s own
// comment for why that import must never be static.

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

type Block =
  | { readonly type: "mermaid"; readonly content: string }
  | { readonly type: "code"; readonly content: string; readonly lang: string }
  | { readonly type: "text"; readonly content: string };

export const FENCE_PATTERN = /^```(\S*)\s*$/;
export const CLOSING_FENCE_PATTERN = /^```\s*$/;

function splitBlocks(source: string): Block[] {
  const lines = source.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const openMatch = FENCE_PATTERN.exec(lines[i]!);
    if (openMatch) {
      const lang = (openMatch[1] ?? "").toLowerCase();
      const contentLines: string[] = [];
      i += 1;
      while (i < lines.length && !CLOSING_FENCE_PATTERN.test(lines[i]!)) {
        contentLines.push(lines[i]!);
        i += 1;
      }
      i += 1; // skip the closing fence (or run past EOF for an unterminated one - harmless)
      const content = contentLines.join("\n");
      blocks.push(lang === "mermaid" ? { type: "mermaid", content } : { type: "code", content, lang });
      continue;
    }
    const textLines: string[] = [];
    while (i < lines.length && !FENCE_PATTERN.test(lines[i]!)) {
      textLines.push(lines[i]!);
      i += 1;
    }
    blocks.push({ type: "text", content: textLines.join("\n") });
  }
  return blocks;
}

// Splits a slide-deck source (AiAssistProvider.generateSlides()) into
// per-slide chunks at a bare `---` line, fence-aware so a `---` inside a
// slide's own code sample is never mistaken for a slide break - the same
// fence-tracking FENCE_PATTERN/CLOSING_FENCE_PATTERN above already need
// for code/mermaid blocks, reused here rather than re-declared. Kept
// separate from splitBlocks()/renderMarkdownToHtml() entirely - those
// stay slide-agnostic, so a real Design doc's genuine <hr> (renderTextBlock's
// own /^(-{3,}|\*{3,})$/ match, 4+ dashes or ***) is untouched; this only
// owns the narrower, exact-3-dash case generateSlides()'s prompt reserves
// for slide breaks.
const SLIDE_BOUNDARY_PATTERN = /^---$/;

export function splitMarkdownSlides(source: string): string[] {
  const lines = source.split("\n");
  const slides: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (!inFence && FENCE_PATTERN.test(line)) {
      inFence = true;
      current.push(line);
      continue;
    }
    if (inFence && CLOSING_FENCE_PATTERN.test(line)) {
      inFence = false;
      current.push(line);
      continue;
    }
    if (!inFence && SLIDE_BOUNDARY_PATTERN.test(line.trim())) {
      slides.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  slides.push(current.join("\n"));
  // Drops empty slides (a leading/trailing/doubled `---`) rather than
  // showing a blank "Slide N of M" - never intentional content. Falls
  // back to the raw source as a single slide if every chunk was empty
  // (e.g. a response that's only boundary lines), so the UI never ends
  // up with a zero-slide deck to divide by.
  const nonEmpty = slides.map((s) => s.trim()).filter((s) => s.length > 0);
  return nonEmpty.length > 0 ? nonEmpty : [source];
}

// [label](url), `code`, **bold**/__bold__, *italic*/_italic_ - matched
// against the RAW line, each captured piece escaped individually at
// insertion time. A link only becomes a real <a> when its URL is
// http(s) - anything else (javascript:, data:, ...) renders as plain
// text instead of a dead or dangerous link, since this text originates
// from an LLM response, not a source the app itself wrote.
const INLINE_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;

function renderInline(rawText: string): string {
  let result = "";
  let lastIndex = 0;
  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(rawText)) !== null) {
    result += escapeHtml(rawText.slice(lastIndex, match.index));
    const full = match[0];
    const [, linkLabel, linkUrl, code, boldA, boldB, italicA, italicB] = match;
    if (linkLabel !== undefined && linkUrl !== undefined) {
      if (/^https?:\/\//i.test(linkUrl)) {
        result += `<a href="${escapeAttr(linkUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(linkLabel)}</a>`;
      } else {
        result += escapeHtml(linkLabel);
      }
    } else if (code !== undefined) {
      result += `<code>${escapeHtml(code)}</code>`;
    } else if (boldA !== undefined || boldB !== undefined) {
      result += `<strong>${escapeHtml(boldA ?? boldB ?? "")}</strong>`;
    } else if (italicA !== undefined || italicB !== undefined) {
      result += `<em>${escapeHtml(italicA ?? italicB ?? "")}</em>`;
    } else {
      result += escapeHtml(full);
    }
    lastIndex = match.index + full.length;
  }
  result += escapeHtml(rawText.slice(lastIndex));
  return result;
}

function renderTextBlock(text: string): string {
  const parts: string[] = [];
  let paragraphLines: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushParagraph = (): void => {
    const joined = paragraphLines.join(" ").trim();
    if (joined) {
      parts.push(`<p>${renderInline(joined)}</p>`);
    }
    paragraphLines = [];
  };

  const flushList = (): void => {
    if (listType && listItems.length > 0) {
      const itemsHtml = listItems.map((item) => `<li>${renderInline(item)}</li>`).join("");
      parts.push(`<${listType}>${itemsHtml}</${listType}>`);
    }
    listType = null;
    listItems = [];
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    const headerMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headerMatch) {
      flushParagraph();
      flushList();
      const level = headerMatch[1]!.length;
      parts.push(`<h${level}>${renderInline(headerMatch[2]!)}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph();
      flushList();
      parts.push("<hr />");
      continue;
    }
    const ulMatch = /^[-*]\s+(.*)$/.exec(line);
    if (ulMatch) {
      flushParagraph();
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(ulMatch[1]!);
      continue;
    }
    const olMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (olMatch) {
      flushParagraph();
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(olMatch[1]!);
      continue;
    }
    flushList();
    paragraphLines.push(line);
  }
  flushParagraph();
  flushList();
  return parts.join("\n");
}

let mermaidInitialized = false;
let mermaidIdCounter = 0;

// The dynamic import here is deliberate, not a style choice - it must
// NEVER become a static top-level `import mermaid from "mermaid"`
// anywhere reachable from app.ts. This app is one composition root
// compiled unmodified for both `vite build` (web) and `justc build
// --bundle --format iife` (Android), and every route mounts eagerly at
// boot - a static import would execute at module-evaluation time on
// BOTH targets regardless of whether Design is ever opened. Given
// justscript_compiler#4 (`--bundle` is a no-op for `--target js`), that
// risks taking down the app's entire Android boot, not just gracefully
// degrading this one feature. A lazy import here means the cost (and
// the risk) is deferred to the exact moment a user actually opens
// Design and switches to Preview on a doc with a mermaid fence - and on
// web, Vite code-splits it into its own chunk that nothing else pays
// for on initial load.
async function renderMermaidBlock(source: string): Promise<string> {
  try {
    const { default: mermaid } = await import("mermaid");
    if (!mermaidInitialized) {
      // startOnLoad:false is required, not just tidy - the default
      // (true) makes Mermaid auto-scan the DOM for .mermaid-classed
      // elements on load and render them itself, which fights this
      // module's own explicit, on-demand render() calls.
      mermaid.initialize({ startOnLoad: false });
      mermaidInitialized = true;
    }
    mermaidIdCounter += 1;
    const id = `mermaid-diagram-${mermaidIdCounter}`;
    const { svg } = await mermaid.render(id, source);
    return `<div class="mermaid-diagram">${svg}</div>`;
  } catch {
    // A real, expected outcome, not just defensive hedging: happy-dom
    // (this app's verify_web.mjs test environment) genuinely cannot
    // render Mermaid - it depends on SVGTextElement.getBBox() for text
    // measurement, which DOM-emulation libraries don't implement
    // meaningfully. The same fallback also covers any real WebView
    // that turns out not to support what Mermaid needs.
    return [
      '<div class="mermaid-fallback">',
      '<p class="mermaid-fallback-note">⚠️ Diagram couldn\'t be rendered in this environment.</p>',
      `<pre><code>${escapeHtml(source)}</code></pre>`,
      "</div>",
    ].join("");
  }
}

export async function renderMarkdownToHtml(source: string): Promise<string> {
  const blocks = splitBlocks(source);
  const rendered = await Promise.all(
    blocks.map((block) => {
      if (block.type === "mermaid") {
        return renderMermaidBlock(block.content);
      }
      if (block.type === "code") {
        return Promise.resolve(`<pre><code>${escapeHtml(block.content)}</code></pre>`);
      }
      return Promise.resolve(renderTextBlock(block.content));
    })
  );
  return rendered.join("\n");
}
