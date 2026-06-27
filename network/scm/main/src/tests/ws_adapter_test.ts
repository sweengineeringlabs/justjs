import { describe, it, expect } from "bun:test"
import { DefaultWsAdapter } from "../core/ws_adapter.js"

describe("DefaultWsAdapter", () => {
  it("test_connect_rejects_on_ws_error", async () => {
    class MockWebSocket extends EventTarget {
      static readonly CONNECTING = 0
      constructor(url: string) {
        super()
        setTimeout(() => this.dispatchEvent(new Event("error")), 0)
      }
      send(_data: unknown): void {}
      close(): void {}
    }
    const original = globalThis.WebSocket
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    const adapter = new DefaultWsAdapter()
    await expect(adapter.connect("ws://bad")).rejects.toMatchObject({ code: "WS_CONNECT_FAILED" })

    globalThis.WebSocket = original
  })
})
