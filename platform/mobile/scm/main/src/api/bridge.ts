// Request/response envelope matching ../justscript_runtime's (repo: js-runtime)
// main/features/mobile-bridge/src/lib.rs `dispatch()` function exactly - read
// directly from that source (and its own tests), not guessed.

export interface BridgeRequestArgs {
  readonly positional?: readonly string[]
  readonly flags?: Record<string, string>
}

export interface BridgeSuccessResponse {
  readonly ok: true
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface BridgeErrorResponse {
  readonly ok: false
  readonly error: string
}

export type BridgeResponse = BridgeSuccessResponse | BridgeErrorResponse

// The global `window.AndroidBridge` object justscript_runtime's android-shell
// (MainActivity.java's `Bridge` inner class) injects into the WebView via
// `addJavascriptInterface(new Bridge(), "AndroidBridge")`.
export interface AndroidBridgeGlobal {
  dispatchCommand(name: string, argsJson: string): string
}

export class MobileBridgeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MobileBridgeError"
  }
}

// Structured payload shapes for the commands whose `stdout` is itself JSON
// (echo, contacts, health) - per lib.rs's own tests:
//   test_dispatch_contacts_happy_path_returns_callback_payload:
//     stdout == `[{"name":"Ada","number":"555-0100"}]`
//   get_step_count default: `{"steps":0}`
export interface EchoResult {
  readonly positional: readonly string[]
  readonly flags: Record<string, string>
}

export interface Contact {
  readonly name: string
  readonly number: string
}

export interface HealthResult {
  readonly steps: number
}

// The typed facade @justjs/mobile exposes over window.AndroidBridge - the
// six commands main/features/mobile-bridge/src/lib.rs actually dispatches
// today. GPS/location is deliberately not included here: it isn't
// implemented anywhere in js-runtime yet (confirmed by reading lib.rs in
// full), so this facade doesn't claim a capability that doesn't exist.
export interface MobileBridge {
  echo(positional?: readonly string[], flags?: Record<string, string>): Promise<EchoResult>
  notify(title: string, body: string): Promise<void>
  biometricAuth(): Promise<void>
  contacts(): Promise<readonly Contact[]>
  camera(): Promise<string>
  health(): Promise<HealthResult>
}

export interface MobilePlatformCapabilities {
  readonly touch: boolean
  readonly orientation: boolean
  readonly push: boolean
  readonly camera: boolean
  readonly biometrics: boolean
  readonly contacts: boolean
  readonly health: boolean
  readonly gps: boolean
}

// What justscript_runtime's android-shell actually supports today (verified
// against main/features/mobile-bridge/src/lib.rs's dispatch() match arms) -
// gps stays false until that project implements it.
export const JS_RUNTIME_SHELL_CAPABILITIES: MobilePlatformCapabilities = {
  touch: true,
  orientation: true,
  push: true,
  camera: true,
  biometrics: true,
  contacts: true,
  health: true,
  gps: false,
}
