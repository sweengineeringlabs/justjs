import type { UIEventBus } from "../api/signal.js"

export class DefaultUIEventBus implements UIEventBus {
  private listeners = new Map<string, Set<(data?: unknown) => void>>()

  emit(event: string, data?: unknown): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data)
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error)
        }
      })
    }
  }

  on(event: string, listener: (data?: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }

    const handlers = this.listeners.get(event)!
    handlers.add(listener)

    return () => {
      handlers.delete(listener)
      if (handlers.size === 0) {
        this.listeners.delete(event)
      }
    }
  }
}
