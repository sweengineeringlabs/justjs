import type { LazyCustomElementRegistry } from "@justjs/application"

export interface ComponentProps {
  readonly [key: string]: unknown
}

// A single entry of justweb's LazyCustomElementRegistry (@justjs/application) -
// the same lazy-loader shape adaptCustomElementRegistry consumes client-side,
// so SSR and client hydration always construct the identical class (ADR-0005).
export type LazyCustomElementLoader = LazyCustomElementRegistry[string]

export interface ComponentSlot {
  readonly name: string
  readonly content: string
}

export interface RenderedComponent {
  readonly tag: string
  readonly shadowDom: string
  readonly lightDom: readonly ComponentSlot[]
  readonly html: string
}

export class SSRError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SSRError"
  }
}
