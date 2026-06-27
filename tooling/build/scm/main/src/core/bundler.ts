import type {
  ImportMap,
  BundleResult,
  HtmlOutput,
} from "../api/bundle.js"
import { BuildError } from "../api/bundle.js"

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

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
  const imports: Set<string> = new Set()
  const importRegex = /(?:import|from)\s+["']([^"']+)["']/g
  let match

  while ((match = importRegex.exec(code)) !== null) {
    const specifier = match[1]
    if (specifier && !specifier.startsWith(".")) {
      imports.add(specifier)
    }
  }

  return Array.from(imports).sort()
}

export function validateTreeShaking(
  bundleCode: string,
  importmap: ImportMap
): string[] {
  const importsInCode = extractImportsFromCode(bundleCode)
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
  importmap: ImportMap
): BundleResult {
  const importsUsed = validateTreeShaking(bundleCode, importmap)

  return {
    code: bundleCode,
    size: bundleCode.length,
    importsUsed,
  }
}
