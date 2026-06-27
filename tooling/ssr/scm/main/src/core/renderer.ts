import type {
  ComponentProps,
  ComponentSlot,
  RenderedComponent,
  ComponentDefinition,
} from "../api/component.js"
import { SSRError } from "../api/component.js"

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function renderComponent(
  tag: string,
  component: ComponentDefinition,
  props: ComponentProps = {},
  slots: readonly ComponentSlot[] = []
): RenderedComponent {
  if (!tag.includes("-")) {
    throw new SSRError(
      `Invalid component tag: ${tag}. Custom elements must include a hyphen.`
    )
  }

  const shadowDom = component.renderShadowDom(props)
  const lightDomContent = component.renderSlots
    ? component.renderSlots(slots)
    : slots.map((slot) => `<div slot="${escapeHtml(slot.name)}">${slot.content}</div>`).join("")

  const html = `<${tag}>${lightDomContent}
  <template shadowrootmode="open">
${shadowDom
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
  </template>
</${tag}>`

  return {
    tag,
    shadowDom,
    lightDom: slots,
    html,
  }
}

export function renderDeclarativeShadowDom(
  tag: string,
  shadowDom: string,
  lightDom: string = ""
): string {
  return `<${tag}>${lightDom}
  <template shadowrootmode="open">
${shadowDom
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
  </template>
</${tag}>`
}
