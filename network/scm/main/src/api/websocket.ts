export interface WsMessage {
  readonly type: "text" | "binary" | "close" | "error"
  readonly data?: string | ArrayBuffer
  readonly code?: number
  readonly reason?: string
}

export interface WsConnection {
  send(data: string | ArrayBuffer): Promise<void>
  close(): Promise<void>
  isOpen(): boolean
}

export interface WsAdapter {
  connect(url: string): Promise<WsConnection>
  onMessage(handler: (msg: WsMessage) => void): void
}

export class WsError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code)
    this.name = "WsError"
  }
}
