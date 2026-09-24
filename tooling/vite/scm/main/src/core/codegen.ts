import { readFileSync, writeFileSync, watchFile, existsSync } from "fs"
import { createHash } from "node:crypto"
import { resolve, dirname, isAbsolute, relative, sep } from "path"
import type {
  JustJSConfig,
  AspectTargetConfig,
  SecurityConfig,
  ObservabilityConfig,
  FlagsConfig,
  AnalyticsConfig,
  ThemingConfig,
  I18nConfig,
  JustWebConfig,
  GeneratedOutput,
} from "../api/config.js"
import type { JustWebArtifactManifest } from "@justjs/application"
import { SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA, SUPPORTED_JUSTWEB_GENERATOR_REVISION, SUPPORTED_JUSTWEB_GENERATOR_VERSION } from "@justjs/application"
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
const JUSTWEB_MANIFEST_PATH = resolve(APP_ROOT, "public/justweb-artifacts.gen.json")

function validateJustWebConfig(value: unknown): JustWebConfig {
  if (!value || typeof value !== "object") {
    throw new CodegenError("justjs.config.toml requires [justweb] with generator_version, generator_revision, artifact_schema, and artifact_manifest.")
  }
  const config = value as Partial<JustWebConfig>
  if (config.generator_version !== SUPPORTED_JUSTWEB_GENERATOR_VERSION ||
      config.generator_revision !== SUPPORTED_JUSTWEB_GENERATOR_REVISION ||
      config.artifact_schema !== SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA ||
      config.artifact_manifest !== "public/justweb-artifacts.gen.json") {
    throw new CodegenError(`[justweb] must pin generator_version = "${SUPPORTED_JUSTWEB_GENERATOR_VERSION}", generator_revision = "${SUPPORTED_JUSTWEB_GENERATOR_REVISION}", artifact_schema = ${SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA}, and artifact_manifest = "public/justweb-artifacts.gen.json".`)
  }
  return config as JustWebConfig
}

export function readJustWebManifest(): JustWebArtifactManifest {
  if (!existsSync(JUSTWEB_MANIFEST_PATH)) {
    throw new CodegenError(`Required JustWeb manifest not found: ${JUSTWEB_MANIFEST_PATH}. Run the pinned justw generate app first.`)
  }
  let manifest: JustWebArtifactManifest
  try {
    manifest = JSON.parse(readFileSync(JUSTWEB_MANIFEST_PATH, "utf-8")) as JustWebArtifactManifest
  } catch (error) {
    throw new CodegenError(`Invalid JustWeb manifest JSON: ${String(error)}`)
  }
  if (manifest.format !== "justweb-artifact-manifest" || manifest.formatVersion !== 1 ||
      manifest.generator?.name !== "justw" || manifest.generator.version !== "0.1.0" ||
      !/^[a-f0-9]{40}$/.test(manifest.generator.revision) || manifest.generator.sourceDirty !== false ||
      !Array.isArray(manifest.artifacts)) {
    throw new CodegenError("Unsupported or malformed JustWeb manifest; JustJS requires the justweb-artifact-manifest format 1 from justw 0.1.0.")
  }
  const seen = new Set<string>()
  for (const artifact of manifest.artifacts) {
    if (!artifact || typeof artifact.path !== "string" || artifact.path.includes("\\") ||
        isAbsolute(artifact.path) || artifact.path.split("/").some((part: string) => part === "" || part === "." || part === "..") ||
        !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
        seen.has(artifact.path)) {
      throw new CodegenError("JustWeb manifest contains an invalid or duplicate artifact entry.")
    }
    seen.add(artifact.path)
    const artifactPath = resolve(APP_ROOT, artifact.path)
    const fromRoot = relative(APP_ROOT, artifactPath)
    if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
      throw new CodegenError(`JustWeb artifact escapes the application root: ${artifact.path}`)
    }
    if (!existsSync(artifactPath)) throw new CodegenError(`JustWeb artifact missing: ${artifact.path}`)
    const actual = createHash("sha256").update(readFileSync(artifactPath)).digest("hex")
    if (actual !== artifact.sha256) throw new CodegenError(`JustWeb artifact changed after generation: ${artifact.path}. Regenerate with the pinned justw.`)
  }
  const has = (name: string) => [...seen].some((path) => path.endsWith(name))
  if (!has("dom-address-map.json") || !has("registry.gen.ts") || !has("component-registry.gen.ts")) {
    throw new CodegenError("JustWeb manifest must cover its DOM address map and both generated registries.")
  }
  return manifest
}

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
  config.justweb = validateJustWebConfig(parsed.justweb)

  return config as unknown as JustJSConfig
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
  strategies: Map<string, string>,
  justwebManifest: JustWebArtifactManifest
): GeneratedOutput {
  const pin = validateJustWebConfig(config.justweb)
  if (justwebManifest.format !== "justweb-artifact-manifest" || justwebManifest.formatVersion !== pin.artifact_schema ||
      justwebManifest.generator?.name !== "justw" || justwebManifest.generator.version !== pin.generator_version ||
      justwebManifest.generator.revision !== pin.generator_revision || justwebManifest.generator.sourceDirty !== false) {
    throw new CodegenError("JustWeb manifest does not satisfy the exact clean generator version, revision, and schema pinned by this application.")
  }
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

const JUSTWEB_MANIFEST = ${JSON.stringify(justwebManifest, null, 2)} as const
const JUSTWEB_CONTRACT = {
  generatorVersion: ${JSON.stringify(config.justweb.generator_version)},
  generatorRevision: ${JSON.stringify(config.justweb.generator_revision)},
  artifactSchema: ${config.justweb.artifact_schema},
} as const

${importsStr}
import { justjs } from "@justjs/application"
import type { BootConfig } from "@justjs/application"
// import { COMPONENT_REGISTRY } from "./registry.gen"
// import { ROUTES } from "./routes.gen"
// import { DOM_ADDRESS_MAP } from "./dom-address-map.gen"

export async function boot(config?: Partial<BootConfig>) {
  await justjs.boot({
    // routes: ROUTES,
    // registry: COMPONENT_REGISTRY,
    // domAddressMap: DOM_ADDRESS_MAP,
    ...${JSON.stringify(bootConfig, null, 2)},
    ...config,
    justwebContract: JUSTWEB_CONTRACT,
    justwebManifest: JUSTWEB_MANIFEST,
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
  const manifest = readJustWebManifest()
  if (manifest.generator.version !== config.justweb.generator_version ||
      manifest.generator.revision !== config.justweb.generator_revision ||
      manifest.formatVersion !== config.justweb.artifact_schema) {
    throw new CodegenError("Generated JustWeb output does not match the exact version, revision, or artifact schema pinned in [justweb].")
  }
  return generateCodeWithStrategies(config, strategies, manifest)
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
