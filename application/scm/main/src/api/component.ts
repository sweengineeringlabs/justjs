export interface ComponentProps {
  readonly [key: string]: unknown
}

export interface Component<Props extends ComponentProps = ComponentProps> {
  name: string
  render(props: Props, element: Element): void | Promise<void>
  update?(props: Props, element: Element): void | Promise<void>
}

export interface ComponentContext {
  readonly tag: string
  readonly props: ComponentProps
  readonly element: Element
}

export interface MountHandle {
  unmount(): void
}

export interface RuntimeAdapter {
  mount(ddasId: string, element: Element): MountHandle
}

export class NoopRuntimeAdapter implements RuntimeAdapter {
  mount(): MountHandle {
    return { unmount() {} }
  }
}

export class ComponentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ComponentError"
  }
}
