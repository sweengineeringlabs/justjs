import type { BootConfig }    from "../api/boot.js"
import type { AspectProvider } from "../api/aspect.js"
import { validateBootConfig }  from "./boot_validator.js"

const registry = new Map<string, Map<string, AspectProvider>>()

function registerProvider(provider: AspectProvider): void {
  let strategies = registry.get(provider.concern)
  if (strategies === undefined) {
    strategies = new Map()
    registry.set(provider.concern, strategies)
  }
  strategies.set(provider.strategy, provider)
}

function registeredStrategies(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const [concern, strategies] of registry) {
    out.set(concern, new Set(strategies.keys()))
  }
  return out
}

export const JustJS = {
  providers: {
    register(provider: AspectProvider): void {
      registerProvider(provider)
    },
    resolve(concern: string, strategy: string): AspectProvider | null {
      return registry.get(concern)?.get(strategy) ?? null
    },
  },

  boot(config: BootConfig): void {
    const errors = validateBootConfig(config, registeredStrategies())
    if (errors.length > 0) {
      throw errors[0]
    }
    // Layer wiring — Network → Transport → Application → Data
    // AOP weaving — providers resolved and woven per target
    // Implemented in #24
  },
} as const
