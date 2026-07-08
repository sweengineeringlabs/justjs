export type {
  ApiRequest,
  ApiResponse,
  ApiAdapter,
} from "../api/api_adapter.js"
export { TransportError } from "../api/api_adapter.js"

export type {
  CacheEntry,
  CacheAdapter,
} from "../api/cache_adapter.js"
export { CacheError } from "../api/cache_adapter.js"

import type { ApiAdapter } from "../api/api_adapter.js"
import type { CacheAdapter } from "../api/cache_adapter.js"
import type { FetchAdapter } from "@justjs/network"
import { DefaultApiAdapter } from "../core/api_adapter.js"
import { DefaultCacheAdapter } from "../core/cache_adapter.js"

// Factories, not direct class re-exports (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// ApiAdapter/CacheAdapter contract, never the concrete Default* class name.
export function createApiAdapter(fetchAdapter: FetchAdapter): ApiAdapter {
  return new DefaultApiAdapter(fetchAdapter)
}

export function createCacheAdapter(): CacheAdapter {
  return new DefaultCacheAdapter()
}
