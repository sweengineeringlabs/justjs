import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { ThemingProviderConfig } from "../api/provider.js"
import { NoopUIThemingContext } from "../api/provider.js"

class DefaultThemingAspect implements JustJSAspect {
  readonly concern = "theming" as const
  readonly strategy = "noop" as const

  context() { return new NoopUIThemingContext() }
  weave(_target: AspectTarget): void {}
}

export class DefaultThemingProvider {
  readonly concern = "theming" as const
  readonly strategy = "noop" as const
  factory(_config?: ThemingProviderConfig): DefaultThemingAspect { return new DefaultThemingAspect() }
}
