import type { BootConfig, BootError } from "@justjs/core"
import { validateBootConfig }         from "./boot_validator.js"

export const JustJS = {
  boot(config: BootConfig): void {
    const errors = validateBootConfig(config)
    if (errors.length > 0) {
      throw errors[0]
    }
    // Layer wiring — Network, Transport, Application, Data
    // Aspect weaving — SPI providers resolved and woven per target
    // TODO: implement in child issues
  }
} as const
