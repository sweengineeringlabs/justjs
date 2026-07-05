import { describe, it, expect } from "bun:test"
import { WsError } from "../api/websocket.js"

describe("websocket adapter", () => {
  it("test_websocket_connection_invalid_url_throws_error", async () => {
    // Mock test - real WebSocket requires browser environment
    expect(() => {
      new WebSocket("invalid://url")
    }).toThrow()
  })

  it("test_ws_error_has_code", () => {
    const error = new WsError("TEST_ERROR", "Test message")
    
    expect(error.code).toBe("TEST_ERROR")
    expect(error.message).toBe("Test message")
  })

  it("test_ws_error_name", () => {
    const error = new WsError("CONNECTION_FAILED")
    
    expect(error.name).toBe("WsError")
  })
})
