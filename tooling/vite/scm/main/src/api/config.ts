export interface JustJSConfig {
  readonly security?: SecurityConfig
  readonly observability?: ObservabilityConfig
  readonly flags?: FlagsConfig
  readonly analytics?: AnalyticsConfig
  readonly theming?: ThemingConfig
  readonly i18n?: I18nConfig
}

export interface SecurityConfig {
  readonly strategy: string
  readonly on?: readonly string[]
  readonly except?: readonly string[]
}

export interface ObservabilityConfig {
  readonly strategy: string
  readonly all?: boolean
  readonly on?: readonly string[]
  readonly except?: readonly string[]
}

export interface FlagsConfig {
  readonly strategy: string
  readonly on?: readonly string[]
  readonly except?: readonly string[]
}

export interface AnalyticsConfig {
  readonly strategy: string
  readonly on?: readonly string[]
  readonly except?: readonly string[]
}

export interface ThemingConfig {
  readonly strategy: string
  readonly on?: readonly string[]
  readonly except?: readonly string[]
}

export interface I18nConfig {
  readonly strategy: string
  readonly on?: readonly string[]
  readonly except?: readonly string[]
}

export class CodegenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CodegenError"
  }
}

export interface GeneratedOutput {
  readonly code: string
  readonly imports: readonly string[]
}
