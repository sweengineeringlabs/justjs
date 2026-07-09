export type {
  BridgeRequestArgs,
  BridgeResponse,
  BridgeSuccessResponse,
  BridgeErrorResponse,
  AndroidBridgeGlobal,
  EchoResult,
  Contact,
  HealthResult,
  MobileBridge,
  MobilePlatformCapabilities,
} from "../api/bridge.js"
export { MobileBridgeError, JS_RUNTIME_SHELL_CAPABILITIES } from "../api/bridge.js"

import type { RuntimeAdapter } from "@justjs/application"
import type { MobileBridge } from "../api/bridge.js"
import { JsRuntimeShellAdapter } from "../core/js_runtime_shell_adapter.js"
import { JsRuntimeShellBridge } from "../core/js_runtime_shell_bridge.js"

// Factories, not direct class re-exports (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// RuntimeAdapter/MobileBridge contract, never the concrete Default*-style
// class name.
export function createJsRuntimeShellAdapter(): RuntimeAdapter {
  return new JsRuntimeShellAdapter()
}

export function createMobileBridge(): MobileBridge {
  return new JsRuntimeShellBridge()
}
