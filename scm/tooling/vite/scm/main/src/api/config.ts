export interface AspectConfig {
  strategy: string
  on?: string[]
  except?: string[]
  all?: boolean
}

export interface JustJSConfig {
  security?: AspectConfig
  observability?: AspectConfig
  i18n?: AspectConfig
  flags?: AspectConfig
  analytics?: AspectConfig
  theming?: AspectConfig
  aspects?: AspectConfig[]
}

export interface CodegenResult {
  imports: string[]
  bootCall: string
}
