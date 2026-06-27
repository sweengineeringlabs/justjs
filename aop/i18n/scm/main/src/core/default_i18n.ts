import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { I18nProviderConfig } from "../api/api_provider.js"
import { NoopI18nContext } from "../api/api_provider.js"

class DefaultI18nAspect implements JustJSAspect {
  readonly concern = "i18n" as const
  readonly strategy = "noop" as const

  context() { return new NoopI18nContext() }
  weave(_target: AspectTarget): void {}
}

export class DefaultI18nProvider {
  readonly concern = "i18n" as const
  readonly strategy = "noop" as const
  factory(_config?: I18nProviderConfig): DefaultI18nAspect { return new DefaultI18nAspect() }
}
