import type { FetchAdapter }             from "@justjs/network"
import type { ApiAdapter, TransportError, TransportErrorCode } from "../api/adapter.js"

function makeTransportError(
  code: TransportErrorCode,
  message: string,
  status?: number
): TransportError {
  const err = new Error(message) as TransportError
  Object.defineProperties(err, {
    code:   { value: code },
    status: { value: status },
  })
  return err
}

export class DefaultApiAdapter implements ApiAdapter {
  readonly #fetch: FetchAdapter
  readonly #baseUrl: string

  constructor(fetch: FetchAdapter, baseUrl: string) {
    this.#fetch = fetch
    this.#baseUrl = baseUrl.replace(/\/$/, "")
  }

  async get<T>(featureId: string): Promise<T | null> {
    const res = await this.#fetch.fetch(`${this.#baseUrl}/${featureId}`)
    if (res.status === 404) return null
    if (!res.ok) throw makeTransportError("REQUEST_FAILED", `GET ${featureId} failed`, res.status)
    return res.json() as Promise<T>
  }

  async mutate<T>(featureId: string, payload: unknown): Promise<T> {
    const res = await this.#fetch.fetch(`${this.#baseUrl}/${featureId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw makeTransportError("REQUEST_FAILED", `POST ${featureId} failed`, res.status)
    return res.json() as Promise<T>
  }

  async upload<T>(featureId: string, data: Blob | ArrayBuffer): Promise<T> {
    const body = data instanceof ArrayBuffer ? new Blob([data]) : data
    const res = await this.#fetch.fetch(`${this.#baseUrl}/${featureId}/upload`, {
      method: "POST",
      body,
    })
    if (!res.ok) throw makeTransportError("UPLOAD_FAILED", `upload to ${featureId} failed`, res.status)
    return res.json() as Promise<T>
  }
}
