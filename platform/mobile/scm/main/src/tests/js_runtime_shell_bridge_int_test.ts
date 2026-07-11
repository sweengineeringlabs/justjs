import { describe, it, expect, afterEach } from "bun:test"
import { JsRuntimeShellBridge } from "../core/js_runtime_shell_bridge.js"
import { MobileBridgeError } from "../api/bridge.js"
import type { AndroidBridgeGlobal } from "../api/bridge.js"

// Mocks window.AndroidBridge exactly at the seam justscript_runtime's
// android-shell (MainActivity.java's Bridge inner class) actually injects:
// dispatchCommand(name, argsJson): string, JSON in and JSON out. Response
// envelope shape (`{ok, stdout, stderr, exitCode}` / `{ok:false, error}`)
// matches main/features/mobile-bridge/src/lib.rs's real dispatch() function
// exactly - not invented for this test.
function installMockBridge(handler: (name: string, argsJson: string) => string): void {
  ;(globalThis as { AndroidBridge?: AndroidBridgeGlobal }).AndroidBridge = {
    dispatchCommand: handler,
  }
}

function successEnvelope(stdout: string): string {
  return JSON.stringify({ ok: true, stdout, stderr: "", exitCode: 0 })
}

function errorEnvelope(error: string): string {
  return JSON.stringify({ ok: false, error })
}

describe("JsRuntimeShellBridge", () => {
  afterEach(() => {
    delete (globalThis as { AndroidBridge?: AndroidBridgeGlobal }).AndroidBridge
  })

  it("test_echo_round_trips_positional_and_flags_through_the_bridge", async () => {
    let capturedCommand = ""
    let capturedArgs = ""
    installMockBridge((name, argsJson) => {
      capturedCommand = name
      capturedArgs = argsJson
      return successEnvelope(JSON.stringify({ positional: ["a"], flags: { x: "1" } }))
    })

    const bridge = new JsRuntimeShellBridge()
    const result = await bridge.echo(["a"], { x: "1" })

    expect(capturedCommand).toBe("echo")
    expect(JSON.parse(capturedArgs)).toEqual({ positional: ["a"], flags: { x: "1" } })
    expect(result).toEqual({ positional: ["a"], flags: { x: "1" } })
  })

  it("test_notify_sends_title_and_body_as_flags", async () => {
    let capturedArgs = ""
    installMockBridge((_name, argsJson) => {
      capturedArgs = argsJson
      return successEnvelope("notification posted")
    })

    const bridge = new JsRuntimeShellBridge()
    await bridge.notify("Hello", "World")

    expect(JSON.parse(capturedArgs)).toEqual({ flags: { title: "Hello", body: "World" } })
  })

  it("test_biometric_auth_resolves_on_success", async () => {
    installMockBridge(() => successEnvelope("biometric authentication verified"))
    const bridge = new JsRuntimeShellBridge()
    await expect(bridge.biometricAuth()).resolves.toBeUndefined()
  })

  it("test_biometric_auth_throws_a_mobile_bridge_error_with_the_real_reason_on_failure", async () => {
    installMockBridge(() => errorEnvelope("cancelled by user"))
    const bridge = new JsRuntimeShellBridge()
    await expect(bridge.biometricAuth()).rejects.toThrow(MobileBridgeError)
    await expect(bridge.biometricAuth()).rejects.toThrow(/cancelled by user/)
  })

  it("test_contacts_parses_the_json_encoded_stdout_array", async () => {
    installMockBridge(() => successEnvelope(JSON.stringify([{ name: "Ada", number: "555-0100" }])))
    const bridge = new JsRuntimeShellBridge()
    const contacts = await bridge.contacts()
    expect(contacts).toEqual([{ name: "Ada", number: "555-0100" }])
  })

  it("test_contacts_throws_the_real_permission_error_not_an_empty_result", async () => {
    installMockBridge(() => errorEnvelope("READ_CONTACTS not granted"))
    const bridge = new JsRuntimeShellBridge()
    await expect(bridge.contacts()).rejects.toThrow(/READ_CONTACTS not granted/)
  })

  it("test_camera_returns_the_raw_base64_stdout_unparsed", async () => {
    installMockBridge(() => successEnvelope("dGVzdC1qcGVn"))
    const bridge = new JsRuntimeShellBridge()
    const image = await bridge.camera()
    expect(image).toBe("dGVzdC1qcGVn")
  })

  it("test_health_parses_the_json_encoded_steps_object", async () => {
    installMockBridge(() => successEnvelope(JSON.stringify({ steps: 4213 })))
    const bridge = new JsRuntimeShellBridge()
    const health = await bridge.health()
    expect(health).toEqual({ steps: 4213 })
  })

  it("test_location_parses_the_json_encoded_lat_lon_accuracy_object", async () => {
    installMockBridge(() => successEnvelope(JSON.stringify({ lat: -25.78, lon: 28.04, accuracy: 100 })))
    const bridge = new JsRuntimeShellBridge()
    const location = await bridge.location()
    expect(location).toEqual({ lat: -25.78, lon: 28.04, accuracy: 100 })
  })

  it("test_location_throws_the_real_permission_error_not_a_default_coordinate", async () => {
    installMockBridge(() => errorEnvelope("ACCESS_FINE_LOCATION not granted"))
    const bridge = new JsRuntimeShellBridge()
    await expect(bridge.location()).rejects.toThrow(/ACCESS_FINE_LOCATION not granted/)
  })

  it("test_throws_a_clear_error_when_android_bridge_global_is_missing", async () => {
    const bridge = new JsRuntimeShellBridge()
    await expect(bridge.echo()).rejects.toThrow(/window\.AndroidBridge is not available/)
  })
})
