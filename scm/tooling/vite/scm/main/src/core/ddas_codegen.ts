/**
 * DDAS Codegen — generates component wrappers with auto-stamped data-ddas-id attributes
 */

export interface DdasConfig {
  enabled: boolean
  namespace: string
}

export class DdasCodegen {
  static generateComponentWrapper(componentName: string, domAddressMap: Record<string, string>, config: DdasConfig): string {
    if (!config.enabled) {
      return ""
    }

    const addresses = domAddressMap[componentName] || []
    const addressList = Array.isArray(addresses) ? addresses : [addresses]

    return `
// DDAS auto-stamping wrapper for ${componentName}
import OriginalComponent from './original-${componentName}.js'

export class ${componentName} extends OriginalComponent {
  connectedCallback() {
    super.connectedCallback?.()
    this.stampDdasAttributes()
  }

  private stampDdasAttributes() {
    // Stamp this element with DDAS ID
    this.setAttribute('data-ddas-id', '${componentName}')

    // Stamp children if they have child addresses
    ${addressList.length > 0 ? addressList.map((addr, i) => `
    const child${i} = this.querySelector('[data-ddas-child="${addr}"]')
    if (child${i}) {
      child${i}.setAttribute('data-ddas-id', '${componentName}:${addr}')
    }
    `).join('\n') : '// No child addresses defined'}
  }
}

customElements.define('${componentName}', ${componentName})
`
  }

  static generateDdasInitializer(domAddressMap: Record<string, readonly string[]>): string {
    return `
// DDAS runtime initializer — injects data-ddas-id attributes into all components
export function initDdas() {
  const addressMap = ${JSON.stringify(domAddressMap, null, 2)}

  // Scan DOM and stamp all registered components
  for (const [componentTag, childAddresses] of Object.entries(addressMap)) {
    const components = document.querySelectorAll(componentTag)

    components.forEach((comp, idx) => {
      // Stamp component element
      comp.setAttribute('data-ddas-id', \`\${componentTag}[\${idx}]\`)

      // Stamp child elements if they exist
      if (Array.isArray(childAddresses)) {
        childAddresses.forEach((childAddr) => {
          const childEl = comp.querySelector(\`[data-ddas-ref="\${childAddr}"]\`)
          if (childEl) {
            childEl.setAttribute('data-ddas-id', \`\${componentTag}:\${childAddr}\`)
          }
        })
      }
    })
  }
}

// Call on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDdas)
  } else {
    initDdas()
  }
}
`
  }

  static generateDdasLocator(): string {
    return `
/**
 * DDAS Locator — finds elements by their DDAS addresses
 * Compatible with chromiumctl-cli for automated testing
 */
export class DdasLocator {
  constructor(private cdp: any) {}

  /**
   * Find element by DDAS ID with auto-wait retry
   * Example: "x-counter:button.increment" or "x-form:input.email"
   */
  async forId(ddas: string, timeoutMs: number = 5000): Promise<Element> {
    const selector = \`[data-ddas-id="\${ddas}"]\`
    const startTime = Date.now()

    while (Date.now() - startTime < timeoutMs) {
      const el = document.querySelector(selector)
      if (el && this.isVisible(el)) {
        return el
      }
      // Brief wait and retry
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    throw new Error(\`DDAS locator timeout: \${ddas} not found or not visible\`)
  }

  /**
   * Find all elements matching DDAS pattern
   * Example: "x-counter:*" returns all x-counter children
   */
  async forPattern(pattern: string): Promise<Element[]> {
    const [tag, child] = pattern.split(':')
    if (child === '*') {
      return Array.from(document.querySelectorAll(\`[data-ddas-id^="\${tag}:"]\`))
    }
    return Array.from(document.querySelectorAll(\`[data-ddas-id="\${pattern}"]\`))
  }

  /**
   * Click element by DDAS address
   */
  async click(ddas: string): Promise<void> {
    const el = await this.forId(ddas)
    ;(el as any).click?.()
  }

  /**
   * Fill input field by DDAS address
   */
  async fill(ddas: string, text: string): Promise<void> {
    const el = await this.forId(ddas)
    if (el instanceof HTMLInputElement) {
      el.value = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  /**
   * Get text content by DDAS address
   */
  async text(ddas: string): Promise<string> {
    const el = await this.forId(ddas)
    return el.textContent || ''
  }

  /**
   * Check if element is visible
   */
  private isVisible(el: Element): boolean {
    const style = window.getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden'
  }
}
`
  }
}
