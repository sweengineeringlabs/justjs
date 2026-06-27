import type { AspectProvider, JustJSAspect } from "@justjs/application"

export interface Principal {
  userId: string
  roles: string[]
  permissions: string[]
}

export interface UISecurityContext {
  principal(): Principal | null
  isAuthenticated(): boolean
  hasRole(role: string): boolean
  hasPermission(permission: string): boolean
  token(): string | null
}

export interface SecurityProviderConfig {
  tokenEndpoint?: string
  loginUrl?: string
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
  isAuthenticated(): boolean { return false }
  hasRole(): boolean { return false }
  hasPermission(): boolean { return false }
  token(): string | null { return null }
}
