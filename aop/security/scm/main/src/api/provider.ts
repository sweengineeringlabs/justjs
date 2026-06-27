import type { AspectProvider, JustJSAspect }  from "@justjs/application"
import type { UISecurityContext, Principal }   from "@justjs/application"

export interface SecurityProviderConfig {
  tokenEndpoint?: string
  loginUrl?:      string
}

export interface SecurityAspect extends JustJSAspect {
  readonly concern: "security"
  context(): UISecurityContext
}

export interface SecurityProvider extends AspectProvider<SecurityProviderConfig> {
  readonly concern: "security"
}

export class NoopSecurityContext implements UISecurityContext {
  principal(): Principal | null { return null }
  isAuthenticated(): boolean    { return false }
  hasRole(): boolean            { return false }
  hasPermission(): boolean      { return false }
  token(): string | null        { return null }
}
