export type {
  FetchRequest,
  FetchResponse,
  FetchAdapter,
} from "../api/fetch.js"
export { NetworkError } from "../api/fetch.js"

export type {
  WsMessage,
  WsConnection,
  WsAdapter,
} from "../api/websocket.js"
export { WsError } from "../api/websocket.js"

import type { FetchAdapter } from "../api/fetch.js"
import type { WsAdapter } from "../api/websocket.js"
import { DefaultFetchAdapter } from "../core/fetch_adapter.js"
import { DefaultWsAdapter } from "../core/websocket_adapter.js"

// Factories, not direct class re-exports (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// FetchAdapter/WsAdapter contract, never the concrete Default* class name,
// so the implementation can change without breaking anyone.
export function createFetchAdapter(): FetchAdapter {
  return new DefaultFetchAdapter()
}

export function createWsAdapter(): WsAdapter {
  return new DefaultWsAdapter()
}
