import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { ThemingProviderConfig } from "../api/provider.js"
import { NoopThemingContext } from "../api/provider.js"

class DefaultThemingAspect implements JustJSAspect {
  readonly concern = "theming" as const
  readonly strategy = "noop" as const

  context() { return new NoopThemingContext() }
  weave(_target: AspectTarget): void {}
}

export class DefaultThemingProvider {
  readonly concern = "theming" as const
  readonly strategy = "noop" as const
  factory(_config?: ThemingProviderConfig): DefaultThemingAspect { return new DefaultThemingAspect() }
}
