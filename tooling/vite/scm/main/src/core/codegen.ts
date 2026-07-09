import { readFileSync, writeFileSync, watchFile, existsSync } from "fs"
import { resolve, dirname } from "path"
import type {
  JustJSConfig,
  AspectTargetConfig,
  SecurityConfig,
  ObservabilityConfig,
  FlagsConfig,
  AnalyticsConfig,
  ThemingConfig,
  I18nConfig,
  GeneratedOutput,
} from "../api/config.js"
import { CodegenError } from "../api/config.js"
import { parseToml } from "./toml-parser.js"

// Generated shape @justjs/application's BootConfig.aspects actually reads
// (AspectConfig in application/api/boot.ts) - split routes/components, each
// an optional {on?, except?}. Only present when the TOML config declared at
// least one of the corresponding on_*/except_* keys, so a concern with no
// targeting at all generates `{ strategy }` rather than `{ strategy, routes:
// {}, components: {} }`.
function toAspectConfig(config: { strategy: string } & AspectTargetConfig): Record<string, unknown> {
  const aspectConfig: Record<string, unknown> = { strategy: config.strategy }

  if (config.on_routes || config.except_routes) {
    aspectConfig.routes = {
      ...(config.on_routes ? { on: config.on_routes } : {}),
      ...(config.except_routes ? { except: config.except_routes } : {}),
    }
  }

  if (config.on_components || config.except_components) {
    aspectConfig.components = {
      ...(config.on_components ? { on: config.on_components } : {}),
      ...(config.except_components ? { except: config.except_components } : {}),
    }
  }

  return aspectConfig
}

const APP_ROOT = process.cwd()
const CONFIG_PATH = resolve(APP_ROOT, "justjs.config.toml")
const OUTPUT_PATH = resolve(APP_ROOT, "src/core/app.gen.ts")
const IMPORTMAP_PATH = resolve(APP_ROOT, "importmap.gen.json")

export function readConfig(): JustJSConfig {
  if (!existsSync(CONFIG_PATH)) {
    throw new CodegenError(`Config not found: ${CONFIG_PATH}`)
  }

  const content = readFileSync(CONFIG_PATH, "utf-8")
  const parsed = parseToml(content)
  const config: Record<string, unknown> = {}

  if (parsed.security) {
    config.security = parsed.security as SecurityConfig
  }
  if (parsed.observability) {
    config.observability = parsed.observability as ObservabilityConfig
  }
  if (parsed.flags) {
    config.flags = parsed.flags as FlagsConfig
  }
  if (parsed.analytics) {
    config.analytics = parsed.analytics as AnalyticsConfig
  }
  if (parsed.theming) {
    config.theming = parsed.theming as ThemingConfig
  }
  if (parsed.i18n) {
    config.i18n = parsed.i18n as I18nConfig
  }

  return config as JustJSConfig
}

export function readAvailableStrategies(): Map<string, string> {
  if (!existsSync(IMPORTMAP_PATH)) {
    throw new CodegenError(`Importmap not found: ${IMPORTMAP_PATH}`)
  }

  const importmapContent = readFileSync(IMPORTMAP_PATH, "utf-8")
  const importmap = JSON.parse(importmapContent)
  const strategies = new Map<string, string>()

  for (const [key, value] of Object.entries(importmap.imports)) {
    if (typeof key === "string" && key.startsWith("@justjs/aop-")) {
      strategies.set(key, value as string)
    }
  }

  return strategies
}

export function generateCodeWithStrategies(
  config: JustJSConfig,
  strategies: Map<string, string>
): GeneratedOutput {
  const imports: string[] = []
  const bootConfig: Record<string, unknown> = {}
  const aspects: Record<string, unknown> = {}

  if (config.security) {
    const strategyKey = `@justjs/aop-security-${config.security.strategy}`
    if (!strategies.has(strategyKey)) {
      throw new CodegenError(
        `Unknown security strategy: ${config.security.strategy}`
      )
    }
    imports.push(`import "${strategyKey}"`)
    aspects.security = toAspectConfig(config.security)
  }

  if (config.observability) {
    const strategyKey = `@justjs/aop-observability-${config.observability.strategy}`
    if (!strategies.has(strategyKey)) {
      throw new CodegenError(
        `Unknown observability strategy: ${config.observability.strategy}`
      )
    }
    imports.push(`import "${strategyKey}"`)
    aspects.observability = toAspectConfig(config.observability)
  }

  if (config.flags) {
    const strategyKey = `@justjs/aop-flags-${config.flags.strategy}`
    if (!strategies.has(strategyKey)) {
      throw new CodegenError(
        `Unknown flags strategy: ${config.flags.strategy}`
      )
    }
    imports.push(`import "${strategyKey}"`)
    aspects.flags = toAspectConfig(config.flags)
  }

  if (config.analytics) {
    const strategyKey = `@justjs/aop-analytics-${config.analytics.strategy}`
    if (!strategies.has(strategyKey)) {
      throw new CodegenError(
        `Unknown analytics strategy: ${config.analytics.strategy}`
      )
    }
    imports.push(`import "${strategyKey}"`)
    aspects.analytics = toAspectConfig(config.analytics)
  }

  if (config.theming) {
    const strategyKey = `@justjs/aop-theming-${config.theming.strategy}`
    if (!strategies.has(strategyKey)) {
      throw new CodegenError(
        `Unknown theming strategy: ${config.theming.strategy}`
      )
    }
    imports.push(`import "${strategyKey}"`)
    aspects.theming = toAspectConfig(config.theming)
  }

  if (config.i18n) {
    const strategyKey = `@justjs/aop-i18n-${config.i18n.strategy}`
    if (!strategies.has(strategyKey)) {
      throw new CodegenError(`Unknown i18n strategy: ${config.i18n.strategy}`)
    }
    imports.push(`import "${strategyKey}"`)
    aspects.i18n = toAspectConfig(config.i18n)
  }

  if (Object.keys(aspects).length > 0) {
    bootConfig.aspects = aspects
  }

  const importsStr = imports.length
    ? imports.map((imp) => `${imp}\n`).join("")
    : ""

  const code = `// Auto-generated by @justjs/vite — do not edit

${importsStr}
import { justjs } from "@justjs/application"
// import { COMPONENT_REGISTRY } from "./registry.gen"
// import { ROUTES } from "./routes.gen"
// import { DOM_ADDRESS_MAP } from "./dom-address-map.gen"

export async function boot(config) {
  await justjs.boot({
    // routes: ROUTES,
    // registry: COMPONENT_REGISTRY,
    // domAddressMap: DOM_ADDRESS_MAP,
    ...${JSON.stringify(bootConfig, null, 2)},
    ...config,
  })
}
`

  return {
    code,
    imports,
  }
}

export function generateCode(config: JustJSConfig): GeneratedOutput {
  const strategies = readAvailableStrategies()
  return generateCodeWithStrategies(config, strategies)
}

export function writeOutput(code: string): void {
  const outputDir = dirname(OUTPUT_PATH)
  if (!existsSync(outputDir)) {
    throw new CodegenError(`Output directory does not exist: ${outputDir}`)
  }
  writeFileSync(OUTPUT_PATH, code)
  console.log(`✓ Generated: ${OUTPUT_PATH}`)
}

export async function runCodegen(): Promise<void> {
  try {
    const config = readConfig()
    const output = generateCode(config)
    writeOutput(output.code)
  } catch (error) {
    if (error instanceof CodegenError) {
      console.error(`Error: ${error.message}`)
    } else if (error instanceof Error) {
      console.error(`Unexpected error:`, error.message)
    } else {
      console.error(`Unexpected error:`, error)
    }
    process.exit(1)
  }
}

export async function watchAndCodegen(): Promise<void> {
  await runCodegen()

  console.log(`\nWatching ${CONFIG_PATH}...`)

  watchFile(CONFIG_PATH, async () => {
    try {
      console.log(`\n[${new Date().toLocaleTimeString()}] Config changed`)
      await runCodegen()
    } catch (error) {
      if (error instanceof CodegenError) {
        console.error(`Error: ${error.message}`)
      } else if (error instanceof Error) {
        console.error(`Unexpected error:`, error.message)
      } else {
        console.error(`Unexpected error:`, error)
      }
    }
  })
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  watchAndCodegen()
}
