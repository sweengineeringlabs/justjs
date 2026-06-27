import type { ComponentDefinition, ComponentProps, SSRConfig, RenderResult, HydrationData } from "../api/renderer.js"

export class SSRRenderer {
  constructor(private config: SSRConfig = {}) {}

  renderComponent(tag: string, definition: ComponentDefinition, props: ComponentProps): RenderResult {
    const shadowDomHTML = definition.renderShadowDom(props)
    const html = this.wrapWithShadowDom(tag, shadowDomHTML)
    const hydrationScript = this.generateHydrationScript(tag, props)

    return { html, hydrationScript }
  }

  private wrapWithShadowDom(tag: string, shadowDomHTML: string): string {
    if (!this.config.declarativeShadowDom) {
      return `<${tag}>${shadowDomHTML}</${tag}>`
    }

    return `<${tag}>
  <template shadowrootmode="open">
    ${shadowDomHTML}
  </template>
</${tag}>`
  }

  private generateHydrationScript(tag: string, props: ComponentProps): string {
    const hydrationData: HydrationData = { component: tag, props }
    const json = JSON.stringify(hydrationData)

    return `<script type="application/json" data-hydration="${tag}">
${json}
</script>`
  }

  renderDeclarativeShadowDom(tag: string, shadowDomHTML: string): string {
    return `<${tag}>
  <template shadowrootmode="open">
    ${shadowDomHTML}
  </template>
</${tag}>`
  }
}
