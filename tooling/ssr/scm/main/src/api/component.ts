export interface ComponentProps {
  readonly [key: string]: unknown
}

export interface ComponentSlot {
  readonly name: string
  readonly content: string
}

export interface RenderedComponent {
  readonly tag: string
  readonly shadowDom: string
  readonly lightDom: readonly ComponentSlot[]
  readonly html: string
}

export class SSRError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SSRError"
  }
}

export interface ComponentDefinition {
  renderShadowDom(props: ComponentProps): string
  renderSlots?(slots: readonly ComponentSlot[]): string
}
