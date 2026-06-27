import type { JsonSchema, SchemaDefinition } from "../api/schemas.js"

export const VITE_CONFIG_SCHEMA: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Vite Plugin Config",
  description: "Schema for justjs vite plugin configuration",
  type: "object",
  properties: {
    configPath: {
      type: "string",
      description: "Path to justjs.config.toml",
      examples: ["./src/justjs.config.toml"],
    },
    appFile: {
      type: "string",
      description: "Output file for generated app.ts",
      examples: ["./src/core/app.ts"],
    },
    generateSourceMap: {
      type: "boolean",
      description: "Generate source maps for config parsing",
      default: true,
    },
  },
  required: ["configPath"],
  additionalProperties: false,
}

export const SSR_CONFIG_SCHEMA: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "SSR Config",
  description: "Schema for server-side rendering configuration",
  type: "object",
  properties: {
    declarativeShadowDom: {
      type: "boolean",
      description: "Enable Declarative Shadow DOM rendering",
      default: false,
    },
    hydrationScript: {
      type: "boolean",
      description: "Include hydration script in output",
      default: true,
    },
    compress: {
      type: "boolean",
      description: "Minify generated HTML",
      default: false,
    },
  },
  additionalProperties: false,
}

export const BUILD_CONFIG_SCHEMA: JsonSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Build Config",
  description: "Schema for build pipeline configuration",
  type: "object",
  properties: {
    entrypoint: {
      type: "string",
      description: "Entry point for bundling",
      examples: ["./src/main.ts"],
    },
    outDir: {
      type: "string",
      description: "Output directory for bundled code",
      default: "./dist",
    },
    minify: {
      type: "boolean",
      description: "Minify bundle output",
      default: true,
    },
    inline: {
      type: "boolean",
      description: "Inline importmap into output HTML",
      default: false,
    },
  },
  required: ["entrypoint"],
  additionalProperties: false,
}

export const BUILTIN_SCHEMAS: SchemaDefinition[] = [
  { name: "vite", schema: VITE_CONFIG_SCHEMA },
  { name: "ssr", schema: SSR_CONFIG_SCHEMA },
  { name: "build", schema: BUILD_CONFIG_SCHEMA },
]
