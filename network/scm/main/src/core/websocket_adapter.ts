import type {
  WsAdapter,
  WsConnection,
  WsMessage,
} from "../api/websocket.js"
import { WsError } from "../api/websocket.js"

class DefaultWsConnection implements WsConnection {
  private socket: WebSocket
  private handlers: ((msg: WsMessage) => void)[] = []

  constructor(socket: WebSocket) {
    this.socket = socket

    this.socket.addEventListener("message", (event) => {
      const msg: WsMessage = {
        type: "text",
        data: event.data,
      }
      this.handlers.forEach((h) => h(msg))
    })

    this.socket.addEventListener("close", (event) => {
      const msg: WsMessage = {
        type: "close",
        code: event.code,
        reason: event.reason,
      }
      this.handlers.forEach((h) => h(msg))
    })

    this.socket.addEventListener("error", () => {
      const msg: WsMessage = {
        type: "error",
        code: this.socket.readyState,
      }
      this.handlers.forEach((h) => h(msg))
    })
  }

  async send(data: string | ArrayBuffer): Promise<void> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new WsError("NOT_CONNECTED", "WebSocket is not open")
    }
    this.socket.send(data)
  }

  async close(): Promise<void> {
    this.socket.close()
  }

  isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN
  }

  addHandler(handler: (msg: WsMessage) => void): void {
    this.handlers.push(handler)
  }
}

export class DefaultWsAdapter implements WsAdapter {
  private messageHandlers: ((msg: WsMessage) => void)[] = []

  async connect(url: string): Promise<WsConnection> {
    return new Promise((resolve, reject) => {
      try {
        const socket = new WebSocket(url)

        socket.addEventListener("open", () => {
          const connection = new DefaultWsConnection(socket)
          this.messageHandlers.forEach((h) => connection.addHandler(h))
          resolve(connection)
        })

        socket.addEventListener("error", () => {
          reject(new WsError("CONNECTION_FAILED", "Failed to connect"))
        })
      } catch (error) {
        reject(new WsError("INVALID_URL", String(error)))
      }
    })
  }

  onMessage(handler: (msg: WsMessage) => void): void {
    this.messageHandlers.push(handler)
  }
}
