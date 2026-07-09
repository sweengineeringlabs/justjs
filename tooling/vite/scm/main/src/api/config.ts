export interface JustJSConfig {
  readonly security?: SecurityConfig
  readonly observability?: ObservabilityConfig
  readonly flags?: FlagsConfig
  readonly analytics?: AnalyticsConfig
  readonly theming?: ThemingConfig
  readonly i18n?: I18nConfig
}

// Split routes-vs-components targeting, matching @justjs/application's
// AspectConfig shape exactly (routes: {on?, except?} / components: {on?,
// except?}) - a single flat `on`/`except` is ambiguous about whether its
// entries are route paths or component tags (justjs#60). TOML-authored, so
// snake_case keys read naturally in justjs.config.toml.
export interface AspectTargetConfig {
  readonly on_routes?: readonly string[]
  readonly on_components?: readonly string[]
  readonly except_routes?: readonly string[]
  readonly except_components?: readonly string[]
}

export interface SecurityConfig extends AspectTargetConfig {
  readonly strategy: string
}

export interface ObservabilityConfig extends AspectTargetConfig {
  readonly strategy: string
  readonly all?: boolean
}

export interface FlagsConfig extends AspectTargetConfig {
  readonly strategy: string
}

export interface AnalyticsConfig extends AspectTargetConfig {
  readonly strategy: string
}

export interface ThemingConfig extends AspectTargetConfig {
  readonly strategy: string
}

export interface I18nConfig extends AspectTargetConfig {
  readonly strategy: string
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
