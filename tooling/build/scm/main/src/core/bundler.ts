import type {
  ImportMap,
  BundleResult,
  HtmlOutput,
} from "../api/bundle.js"
import { BuildError } from "../api/bundle.js"
import type { ImportScanner } from "../api/import-scanner.js"
import { DefaultImportScanner } from "./import-scanner.js"

export function validateImportMap(importmap: ImportMap): void {
  if (!importmap.imports || typeof importmap.imports !== "object") {
    throw new BuildError("Invalid importmap: missing 'imports' object")
  }

  for (const [specifier, url] of Object.entries(importmap.imports)) {
    if (typeof specifier !== "string" || !specifier.length) {
      throw new BuildError("Invalid importmap: specifier must be non-empty string")
    }
    if (typeof url !== "string" || !url.length) {
      throw new BuildError(`Invalid importmap: URL for "${specifier}" must be non-empty string`)
    }
  }
}

export function inlineImportmap(
  bundleCode: string,
  importmap: ImportMap
): HtmlOutput {
  validateImportMap(importmap)

  const importmapJson = JSON.stringify(importmap, null, 2)
  const importmapScript = `<script type="importmap">
${importmapJson}
</script>`

  const bundleScript = `<script>
${bundleCode}
</script>`

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${importmapScript}
</head>
<body>
  <div id="app"></div>
  ${bundleScript}
</body>
</html>`

  return {
    html,
    importmapScript,
    bundleScript,
  }
}

export function extractImportsFromCode(code: string): string[] {
  return new DefaultImportScanner().scan(code)
}

export function validateTreeShaking(
  bundleCode: string,
  importmap: ImportMap,
  scanner: ImportScanner = new DefaultImportScanner()
): string[] {
  const importsInCode = scanner.scan(bundleCode)
  const validImports = Object.keys(importmap.imports)

  const invalidImports = importsInCode.filter(
    (imp) => !validImports.includes(imp)
  )

  if (invalidImports.length > 0) {
    throw new BuildError(
      `Bundle contains imports not in importmap: ${invalidImports.join(", ")}`
    )
  }

  return importsInCode
}

export function generateBundleResult(
  bundleCode: string,
  importmap: ImportMap,
  scanner: ImportScanner = new DefaultImportScanner()
): BundleResult {
  const importsUsed = validateTreeShaking(bundleCode, importmap, scanner)

  return {
    code: bundleCode,
    size: bundleCode.length,
    importsUsed,
  }
}
