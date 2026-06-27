export interface BootConfig {
  readonly routes?: Record<string, unknown>
  readonly registry?: Record<string, unknown>
  readonly importmap?: Record<string, unknown>
  readonly domMap?: Record<string, unknown>
  readonly [key: string]: unknown
}

export class BootError extends Error {
  constructor(
    readonly code: string,
    readonly received?: string,
    readonly known?: string[],
    readonly nearest?: string,
    message?: string
  ) {
    super(message ?? `Boot failed: ${code}`)
    this.name = "BootError"
  }
}

export interface JustJSBoot {
  boot(config: BootConfig): Promise<void>
}
