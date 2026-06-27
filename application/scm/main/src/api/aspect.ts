export interface AspectTarget {
  concern: string
  routes?: readonly string[]
  components?: readonly string[]
}

export interface JustJSAspect {
  readonly concern: string
  readonly strategy: string
  weave(target: AspectTarget): void
  context(): unknown
}

export interface AspectProvider<Config = unknown> {
  readonly concern: string
  readonly strategy: string
  factory(config?: Config): JustJSAspect
}
