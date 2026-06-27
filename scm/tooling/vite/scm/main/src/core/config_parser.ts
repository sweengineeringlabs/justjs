import { readFileSync } from "fs"
import { resolve } from "path"
import type { JustJSConfig, AspectConfig, CodegenResult } from "../api/config.js"

const CONCERN_TO_PREFIX: Record<string, string> = {
  security: "@justjs/aop-security",
  observability: "@justjs/aop-observability",
  i18n: "@justjs/aop-i18n",
  flags: "@justjs/aop-flags",
  analytics: "@justjs/aop-analytics",
  theming: "@justjs/aop-theming",
}

export class ConfigParser {
  static parseToml(content: string): JustJSConfig {
    const config: JustJSConfig = {}
    const lines = content.split("\n")
    let currentSection: string | null = null

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue

      if (trimmed.startsWith("[")) {
        currentSection = trimmed.slice(1, -1)
        if (currentSection === "aspects") {
          config.aspects = []
        }
        continue
      }

      if (!currentSection || !trimmed.includes("=")) continue

      const eqIdx = trimmed.indexOf("=")
      const key = trimmed.substring(0, eqIdx).trim()
      let value = trimmed.substring(eqIdx + 1).trim()
      const parsed = this.parseValue(value)

      if (currentSection === "aspects") {
        const aspectConfig = (config.aspects ||= [])
        if (Array.isArray(aspectConfig)) {
          aspectConfig.push({ strategy: parsed as string })
        }
      } else {
        const concerns = ["security", "observability", "i18n", "flags", "analytics", "theming"]
        if (concerns.includes(currentSection)) {
          const existing = (config as any)[currentSection] as any
          const obj = existing || {}
          obj[key] = parsed
          ;(config as any)[currentSection] = obj
        }
      }
    }

    return config
  }

  private static parseValue(value: string): unknown {
    // Strip inline comments, but only outside of quoted strings
    const commentIdx = this.findCommentOutsideQuotes(value)
    if (commentIdx > 0) {
      value = value.substring(0, commentIdx).trim()
    }

    if (value === "true") return true
    if (value === "false") return false
    if (value.startsWith("[") && value.includes("]")) {
      const endIdx = value.indexOf("]")
      const arrayStr = value.substring(1, endIdx)
      return arrayStr
        .split(",")
        .map(s => s.trim().slice(1, -1))
    }
    if (value.startsWith('"') && value.includes('"', 1)) {
      const endIdx = value.indexOf('"', 1)
      return value.substring(1, endIdx)
    }
    return value
  }

  private static findCommentOutsideQuotes(value: string): number {
    let inQuotes = false
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '"' && (i === 0 || value[i - 1] !== "\\")) {
        inQuotes = !inQuotes
      }
      if (value[i] === "#" && !inQuotes) {
        return i
      }
    }
    return -1
  }

  static readConfig(rootDir: string): JustJSConfig {
    const configPath = resolve(rootDir, "justjs.config.toml")
    try {
      const content = readFileSync(configPath, "utf-8")
      return this.parseToml(content)
    } catch {
      return {}
    }
  }

  static generateAppCode(config: JustJSConfig, routes: unknown, importmap: unknown, registry: unknown, domMap: unknown): CodegenResult {
    const imports: string[] = []

    for (const [concern, cfg] of Object.entries(config)) {
      if (!cfg || typeof cfg !== "object") continue

      const aspectCfg = cfg as any
      const strategy = aspectCfg.strategy
      if (!strategy) continue

      if (concern !== "aspects") {
        imports.push(`import "@justjs/${concern}-${strategy}"`)
      }
    }

    if (config.aspects) {
      for (const aspect of config.aspects) {
        imports.push(`import "@justjs/aop-${aspect.strategy.split("-")[0]}-${aspect.strategy.split("-").slice(1).join("-")}"`)
      }
    }

    const bootConfig = this.generateBootConfig(config)
    const bootCall = `JustJS.boot({
  routes,
  importmap,
  registry,
  domMap,
  ${bootConfig}
})`

    return { imports, bootCall }
  }

  private static generateBootConfig(config: JustJSConfig): string {
    const lines: string[] = []

    for (const [concern, cfg] of Object.entries(config)) {
      if (!cfg || typeof cfg !== "object") continue
      if (concern === "aspects") continue

      const strategy = (cfg as AspectConfig).strategy
      if (!strategy) continue

      const aspect = cfg as AspectConfig
      const fields: string[] = [`strategy: "${strategy}"`]

      if (aspect.all) {
        fields.push(`all: true`)
      } else if (aspect.on?.length) {
        fields.push(`on: [${aspect.on.map(r => `"${r}"`).join(", ")}]`)
      }
      if (aspect.except?.length) {
        fields.push(`except: [${aspect.except.map(r => `"${r}"`).join(", ")}]`)
      }

      lines.push(`  ${concern}: { ${fields.join(", ")} }`)
    }

    if (config.aspects?.length) {
      const aspectsArray = config.aspects
        .map(a => {
          const fields = [`strategy: "${a.strategy}"`]
          if (a.all) fields.push(`all: true`)
          if (a.on?.length) fields.push(`on: [${a.on.map(r => `"${r}"`).join(", ")}]`)
          return `{ ${fields.join(", ")} }`
        })
        .join(", ")
      lines.push(`  aspects: [${aspectsArray}]`)
    }

    return lines.join(",\n")
  }
}
