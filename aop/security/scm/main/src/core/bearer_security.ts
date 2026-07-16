import type { JustJSAspect, AspectTarget } from "@justjs/application"
import type { ApiAdapter, ApiRequest, ApiResponse } from "@justjs/transport"
import type { Principal, SecurityProviderConfig, UISecurityContext } from "../api/provider.js"

const DEFAULT_TOKEN_STORAGE_KEY = "justjs:bearer-token"

interface JwtClaims {
  sub?: string
  roles?: unknown
  permissions?: unknown
  exp?: number
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/")
  const padding = (4 - (padded.length % 4)) % 4
  return atob(padded + "=".repeat(padding))
}

function decodeJwt(token: string): JwtClaims | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const payload = parts[1]
  if (!payload) return null
  try {
    return JSON.parse(base64UrlDecode(payload)) as JwtClaims
  } catch {
    return null
  }
}

function readToken(storageKey: string): string | null {
  try {
    return globalThis.localStorage?.getItem(storageKey) ?? null
  } catch {
    return null
  }
}

class BearerSecurityContext implements UISecurityContext {
  private readonly storageKey: string

  constructor(config: SecurityProviderConfig) {
    this.storageKey = config.tokenStorageKey ?? DEFAULT_TOKEN_STORAGE_KEY
  }

  private claims(): JwtClaims | null {
    const token = this.token()
    return token ? decodeJwt(token) : null
  }

  token(): string | null {
    return readToken(this.storageKey)
  }

  principal(): Principal | null {
    const claims = this.claims()
    if (!claims || !claims.sub) return null
    return {
      userId: claims.sub,
      roles: Array.isArray(claims.roles) ? (claims.roles as string[]) : [],
      permissions: Array.isArray(claims.permissions) ? (claims.permissions as string[]) : [],
    }
  }

  isAuthenticated(): boolean {
    const claims = this.claims()
    if (!claims || !claims.sub) return false
    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return false
    return true
  }

  hasRole(role: string): boolean {
    return this.principal()?.roles.includes(role) ?? false
  }

  hasPermission(permission: string): boolean {
    return this.principal()?.permissions.includes(permission) ?? false
  }
}

class BearerSecurityAspect implements JustJSAspect {
  readonly concern = "security" as const
  readonly strategy = "bearer" as const
  private readonly ctx: BearerSecurityContext

  constructor(config: SecurityProviderConfig) {
    this.ctx = new BearerSecurityContext(config)
  }

  context() { return this.ctx }
  weave(_target: AspectTarget): void {}
}

export class BearerSecurityProvider {
  readonly concern = "security" as const
  readonly strategy = "bearer" as const
  factory(config?: SecurityProviderConfig): BearerSecurityAspect {
    return new BearerSecurityAspect(config ?? {})
  }
}

// The real hook point for attaching an Authorization header - NOT
// JustJSAspect.weave()/context(), which only ever receive an AspectTarget
// ({concern, routes, components}) with no adapter reference (see
// application/scm/main/src/core/boot.ts's weave loop). ApiAdapter is a
// single fixed instance built once in boot()'s buildRuntime() from
// BootConfig.apiAdapter, with no per-request override path. This decorator
// matches the wrapping idiom ADR-0002 names but never built
// (`new CachingApiAdapter(apiAdapter, cacheAdapter)`) - an app wires it in
// directly: `apiAdapter: createBearerApiAdapter(createApiAdapter(fetchAdapter))`.
export function createBearerApiAdapter(inner: ApiAdapter, config?: SecurityProviderConfig): ApiAdapter {
  const storageKey = config?.tokenStorageKey ?? DEFAULT_TOKEN_STORAGE_KEY

  function withAuth(options?: Partial<ApiRequest>): Partial<ApiRequest> | undefined {
    const token = readToken(storageKey)
    if (!token) return options
    return { ...options, headers: { ...options?.headers, Authorization: `Bearer ${token}` } }
  }

  return {
    get<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
      return inner.get<T>(url, withAuth(options))
    },
    post<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
      return inner.post<T>(url, body, withAuth(options))
    },
    put<T = unknown>(url: string, body?: unknown, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
      return inner.put<T>(url, body, withAuth(options))
    },
    delete<T = unknown>(url: string, options?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
      return inner.delete<T>(url, withAuth(options))
    },
  }
}
