import type { Plugin } from "vite"
import { readFileSync, writeFileSync } from "fs"
import { resolve } from "path"
import { ConfigParser } from "./config_parser.js"

export interface VitePluginOptions {
  rootDir?: string
}

function generateAppFile(result: { imports: string[], bootCall: string }): string {
  return `// DO NOT EDIT BY HAND — generated from justjs.config.toml
${result.imports.join("\n")}

import { JustJS } from "@justjs/application"
import routes from "./routes.gen.json"
import registry from "./registry.gen.ts"
import domMap from "./dom-address-map.json"

export async function app() {
  ${result.bootCall}
}
`
}

export function justjsPlugin(options: VitePluginOptions = {}): Plugin {
  const rootDir = options.rootDir || process.cwd()

  return {
    name: "justjs-config-codegen",
    apply: "build",
    enforce: "pre",

    configResolved() {
      const configPath = resolve(rootDir, "justjs.config.toml")
      const appPath = resolve(rootDir, "src/core/app.ts")

      try {
        const configContent = readFileSync(configPath, "utf-8")
        const config = ConfigParser.parseToml(configContent)

        const routesPath = resolve(rootDir, "src/core/routes.gen.json")
        const registryPath = resolve(rootDir, "src/core/registry.gen.ts")
        const domMapPath = resolve(rootDir, "src/core/dom-address-map.json")

        let routes = { routes: [] }
        let registry = { components: [] }
        let domMap = { elements: {} }

        try {
          routes = JSON.parse(readFileSync(routesPath, "utf-8"))
        } catch {
          // use defaults
        }

        try {
          registry = JSON.parse(readFileSync(registryPath, "utf-8"))
        } catch {
          // use defaults
        }

        try {
          domMap = JSON.parse(readFileSync(domMapPath, "utf-8"))
        } catch {
          // use defaults
        }

        const result = ConfigParser.generateAppCode(config, routes, {}, registry, domMap)
        const appCode = generateAppFile(result)

        writeFileSync(appPath, appCode)
      } catch (error) {
        if (process.env.DEBUG) {
          console.error("[justjs-vite] Error generating app.ts:", error)
        }
      }
    }
  }
}

export default justjsPlugin
