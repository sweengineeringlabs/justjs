export type AspectTarget =
  | { all: true }
  | { on: string[] }
  | { except: string[] }

export interface AspectConfig {
  readonly strategy: string
  readonly config?:  Record<string, unknown>
}

export type AspectDeclaration = AspectConfig & AspectTarget

export interface JustJSAspect {
  readonly concern:  string
  readonly strategy: string
  weave(target: AspectTarget): void
}

export interface AspectProvider<C = Record<string, unknown>> {
  readonly concern:  string
  readonly strategy: string
  factory(config?: C): JustJSAspect
}

export interface AspectRegistry {
  register(provider: AspectProvider): void
  resolve(concern: string, strategy: string): AspectProvider | null
  registered(concern: string): string[]
}
