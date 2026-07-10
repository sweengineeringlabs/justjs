import type {
  AndroidBridgeGlobal,
  BridgeRequestArgs,
  BridgeResponse,
  Contact,
  EchoResult,
  HealthResult,
  MobileBridge,
} from "../api/bridge.js"
import { MobileBridgeError } from "../api/bridge.js"

// `window.AndroidBridge` only exists inside justscript_runtime's android-shell
// WebView - reading it lazily (not at module load time) so importing this
// package doesn't fail outside that host, only calling a bridge method does.
function getAndroidBridge(): AndroidBridgeGlobal {
  const bridge = (globalThis as { AndroidBridge?: AndroidBridgeGlobal }).AndroidBridge
  if (!bridge) {
    throw new MobileBridgeError(
      "window.AndroidBridge is not available - this must run inside justscript_runtime's android-shell WebView"
    )
  }
  return bridge
}

// `args` resolves its default inside the body rather than as a parameter
// default (`args: BridgeRequestArgs = {}`) - justc 0.3.4's iife/cjs bundler
// drops a parameter carrying a default-value expression from the emitted
// signature while leaving the body's reference to it intact, producing a
// real `ReferenceError: args is not defined` at runtime for every caller,
// not just ones that omit the argument (confirmed live on real android-shell
// hardware - justjs#16; same root cause as MountStep's runtimeAdapter fix).
function dispatch(bridge: AndroidBridgeGlobal, name: string, args?: BridgeRequestArgs): BridgeResponse {
  const raw = bridge.dispatchCommand(name, JSON.stringify(args ?? {}))
  return JSON.parse(raw) as BridgeResponse
}

function unwrap(response: BridgeResponse, command: string): string {
  if (!response.ok) {
    throw new MobileBridgeError(`${command} failed: ${response.error}`)
  }
  return response.stdout
}

export class JsRuntimeShellBridge implements MobileBridge {
  // Same justc default-parameter bug as dispatch() above - defaults resolved
  // in the body, not the parameter list.
  async echo(positional?: readonly string[], flags?: Record<string, string>): Promise<EchoResult> {
    const response = dispatch(getAndroidBridge(), "echo", { positional: positional ?? [], flags: flags ?? {} })
    return JSON.parse(unwrap(response, "echo")) as EchoResult
  }

  async notify(title: string, body: string): Promise<void> {
    const response = dispatch(getAndroidBridge(), "notify", { flags: { title, body } })
    unwrap(response, "notify")
  }

  async biometricAuth(): Promise<void> {
    const response = dispatch(getAndroidBridge(), "biometricAuth")
    unwrap(response, "biometricAuth")
  }

  async contacts(): Promise<readonly Contact[]> {
    const response = dispatch(getAndroidBridge(), "contacts")
    return JSON.parse(unwrap(response, "contacts")) as Contact[]
  }

  async camera(): Promise<string> {
    const response = dispatch(getAndroidBridge(), "camera")
    return unwrap(response, "camera")
  }

  async health(): Promise<HealthResult> {
    const response = dispatch(getAndroidBridge(), "health")
    return JSON.parse(unwrap(response, "health")) as HealthResult
  }
}
