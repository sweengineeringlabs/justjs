import type { BootConfig, JustJSBoot } from "../api/boot.js"
import { BootError } from "../api/boot.js"

class BootValidator {
  validate(config: BootConfig): void {
    if (!config.routes) {
      throw new BootError("MISSING_ROUTES", undefined, [], undefined, "Routes configuration required")
    }
    if (!config.registry) {
      throw new BootError("MISSING_REGISTRY", undefined, [], undefined, "Component registry required")
    }
  }
}

export class JustJS implements JustJSBoot {
  private static instance: JustJS | null = null
  private validator = new BootValidator()

  static getInstance(): JustJS {
    if (!JustJS.instance) {
      JustJS.instance = new JustJS()
    }
    return JustJS.instance
  }

  async boot(config: BootConfig): Promise<void> {
    this.validator.validate(config)
    // Boot logic here
  }
}

export const justjs = JustJS.getInstance()
