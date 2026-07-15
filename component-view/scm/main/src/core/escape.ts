// Shared by every view's Shadow DOM template - this package has zero
// dependency on any host app, so it can't reuse ai-code-editor's own
// escapeHtml() (a <div>.textContent round trip) or any other app-local
// helper.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}
