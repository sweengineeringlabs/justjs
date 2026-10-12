export { createImportScanner } from "./import-scanner.js"
export type { ImportScanner } from "./import-scanner.js"
export type {
  ImportMap,
  BundleConfig,
  BundleResult,
  HtmlOutput,
} from "../api/bundle.js"
export { BuildError } from "../api/bundle.js"
export { escapeHtml, createHtmlEscaper } from "@justjs/html"
export type { HtmlEscaper } from "@justjs/html"
export { validateImportMap, inlineImportmap } from "../core/bundler.js"
import type { ImportMap, BundleResult } from "../api/bundle.js"
import { createImportScanner } from "./import-scanner.js"
import { validateTreeShaking as validate, generateBundleResult as bundle } from "../core/bundler.js"

export function extractImportsFromCode(code: string, strategy = "bun"): string[] {
  return createImportScanner(strategy).scan(code)
}

export function validateTreeShaking(code: string, importmap: ImportMap, strategy = "bun"): string[] {
  return validate(code, importmap, createImportScanner(strategy))
}

export function generateBundleResult(code: string, importmap: ImportMap, strategy = "bun"): BundleResult {
  return bundle(code, importmap, createImportScanner(strategy))
}
