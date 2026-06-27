import type { Route } from "./router.js"

export interface Principal {
  readonly id:    string
  readonly roles: string[]
}

export interface UISecurityContext {
  principal():               Principal | null
  isAuthenticated():         boolean
  hasRole(role: string):     boolean
  hasPermission(perm: string): boolean
  token():                   string | null
}

export interface RouteGuard {
  canActivate(route: Route, ctx: UISecurityContext): boolean | Promise<boolean>
  redirectTo(): string
}
