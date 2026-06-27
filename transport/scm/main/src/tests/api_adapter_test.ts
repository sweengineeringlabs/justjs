import { describe, it, expect } from "bun:test"
import { DefaultApiAdapter } from "../core/api_adapter.js"
import { TransportError } from "../api/api_adapter.js"

describe("api adapter", () => {
  it("test_api_adapter_implements_interface", () => {
    const api = new DefaultApiAdapter()

    expect(typeof api.get).toBe("function")
    expect(typeof api.post).toBe("function")
    expect(typeof api.put).toBe("function")
    expect(typeof api.delete).toBe("function")
  })

  it("test_transport_error_has_code_and_status", () => {
    const error = new TransportError("API_ERROR", 500, "Server error")

    expect(error.code).toBe("API_ERROR")
    expect(error.status).toBe(500)
    expect(error.message).toBe("Server error")
  })

  it("test_transport_error_name", () => {
    const error = new TransportError("API_ERROR")

    expect(error.name).toBe("TransportError")
  })
})
