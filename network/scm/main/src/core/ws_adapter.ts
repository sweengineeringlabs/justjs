import type { WsAdapter, WsConnection, NetworkError, NetworkErrorCode } from "../api/adapter.js"

function makeNetworkError(code: NetworkErrorCode, message: string): NetworkError {
  const err = new Error(message) as NetworkError
  Object.defineProperty(err, "code", { value: code })
  return err
}

class DefaultWsConnection implements WsConnection {
  readonly #ws: WebSocket
  readonly #listeners = new Map<string, Set<(data: unknown) => void>>()

  constructor(ws: WebSocket) {
    this.#ws = ws
    this.#ws.addEventListener("message", (e) => {
      const fns = this.#listeners.get("message")
      if (fns) for (const fn of fns) fn(e.data)
    })
    this.#ws.addEventListener("close", () => {
      const fns = this.#listeners.get("close")
      if (fns) for (const fn of fns) fn(undefined)
    })
    this.#ws.addEventListener("error", () => {
      const fns = this.#listeners.get("error")
      if (fns) for (const fn of fns) fn(makeNetworkError("WS_CLOSED", "WebSocket error"))
    })
  }

  send(data: unknown): void {
    this.#ws.send(typeof data === "string" ? data : JSON.stringify(data))
  }

  on(event: string, fn: (data: unknown) => void): () => void {
    let fns = this.#listeners.get(event)
    if (fns === undefined) { fns = new Set(); this.#listeners.set(event, fns) }
    fns.add(fn)
    return () => { fns!.delete(fn) }
  }

  close(): void {
    this.#ws.close()
  }
}

export class DefaultWsAdapter implements WsAdapter {
  connect(url: string): Promise<WsConnection> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.addEventListener("open", () => resolve(new DefaultWsConnection(ws)))
      ws.addEventListener("error", () =>
        reject(makeNetworkError("WS_CONNECT_FAILED", `WebSocket connection to "${url}" failed`))
      )
    })
  }
}
