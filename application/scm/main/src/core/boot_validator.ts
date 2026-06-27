import type { BootConfig, BootError, BootErrorCode } from "../api/boot.js"
import type { AspectDeclaration } from "../api/aspect.js"

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!)
  return dp[m]![n]!
}

function nearest(received: string, known: string[]): string | undefined {
  let best: string | undefined
  let bestDist = Infinity
  for (const k of known) {
    const dist = levenshtein(received, k)
    if (dist < bestDist) { bestDist = dist; best = k }
  }
  return bestDist <= 3 ? best : undefined
}

function makeBootError(
  code: BootErrorCode,
  received: string,
  known: string[],
  message: string
): BootError {
  const err = new Error(message) as BootError
  Object.defineProperties(err, {
    code:     { value: code },
    received: { value: received },
    known:    { value: known },
    nearest:  { value: nearest(received, known) },
  })
  return err
}

function targetsFrom(decl: AspectDeclaration): string[] {
  if ("all" in decl && decl.all) return []
  if ("on"  in decl) return decl.on
  if ("except" in decl) return decl.except
  return []
}

export function validateBootConfig(
  config: BootConfig,
  registeredStrategies: Map<string, Set<string>>
): BootError[] {
  const errors: BootError[] = []

  const knownRoutes     = config.routes.routes.map(r => r.path)
  const knownComponents = config.registry.components.map(c => c.tagName)
  const knownDdas       = Object.keys(config.domMap.elements)

  const aspects: Array<[string, AspectDeclaration]> = [
    ["security",      config.security],
    ["observability", config.observability],
    ["i18n",          config.i18n],
    ["flags",         config.flags],
    ["analytics",     config.analytics],
    ["theming",       config.theming],
    ...(config.aspects ?? []).map((a, i) => [`aspects[${i}]`, a] as [string, AspectDeclaration]),
  ].filter((e): e is [string, AspectDeclaration] => e[1] !== undefined)

  // Check 1: every strategy name is registered
  for (const [concern, decl] of aspects) {
    const strategies = registeredStrategies.get(concern) ?? new Set()
    if (!strategies.has(decl.strategy)) {
      errors.push(makeBootError(
        "UNKNOWN_STRATEGY",
        decl.strategy,
        [...strategies],
        `BootError [${concern}]: strategy "${decl.strategy}" is not registered\n` +
        `  Registered strategies: ${[...strategies].join(", ") || "(none)"}\n` +
        (nearest(decl.strategy, [...strategies]) ? `  Did you mean "${nearest(decl.strategy, [...strategies])}"?` : "")
      ))
    }
  }

  for (const [concern, decl] of aspects) {
    for (const target of targetsFrom(decl)) {
      if (target.startsWith("/")) {
        // Check 2: route exists in routes.gen.json
        if (!knownRoutes.includes(target)) {
          errors.push(makeBootError(
            "UNKNOWN_ROUTE",
            target,
            knownRoutes,
            `BootError [${concern}]: route "${target}" not found in routes.gen.json\n` +
            `  Known routes: ${knownRoutes.join(", ")}\n` +
            (nearest(target, knownRoutes) ? `  Did you mean "${nearest(target, knownRoutes)}"?` : "")
          ))
        }
      } else {
        // Check 3: component tag exists in registry.gen.ts
        if (!knownComponents.includes(target)) {
          errors.push(makeBootError(
            "UNKNOWN_COMPONENT",
            target,
            knownComponents,
            `BootError [${concern}]: component "${target}" not found in registry.gen.ts\n` +
            `  Known components: ${knownComponents.join(", ")}\n` +
            (nearest(target, knownComponents) ? `  Did you mean "${nearest(target, knownComponents)}"?` : "")
          ))
        }

        // Check 4: DDAS address exists in dom-address-map.json
        const ddas = knownDdas.find(id => id.split(":")[2] === target)
        if (ddas === undefined) {
          errors.push(makeBootError(
            "INVALID_DDAS_ADDRESS",
            target,
            knownDdas,
            `BootError [${concern}]: component "${target}" has no DDAS entry in dom-address-map.json\n` +
            `  Known DDAS addresses: ${knownDdas.join(", ")}\n` +
            (nearest(target, knownDdas) ? `  Did you mean "${nearest(target, knownDdas)}"?` : "")
          ))
        }
      }
    }
  }

  return errors
}
