export interface ComponentProps {
  readonly [key: string]: unknown
}

export interface Component<Props extends ComponentProps = ComponentProps> {
  name: string
  render(props: Props): void | Promise<void>
}

export interface ComponentContext {
  readonly tag: string
  readonly props: ComponentProps
  readonly element: Element
}

export interface MountHandle {
  unmount(): void
}

export class ComponentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ComponentError"
  }
}
