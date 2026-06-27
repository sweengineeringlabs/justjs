import type { Importmap, BundleResult, InlineResult } from "../api/bundler.js"

export class BundlePipeline {
  validateTreeShaking(bundleCode: string, importmap: Importmap): string[] {
    const usedImports: string[] = []
    const imports = importmap.imports || {}

    for (const [path, url] of Object.entries(imports)) {
      if (bundleCode.includes(`"${path}"`) || bundleCode.includes(`'${path}'`) || bundleCode.includes(`\`${path}\``)) {
        usedImports.push(path)
      }
    }

    return usedImports
  }

  inlineImportmap(bundleCode: string, importmap: Importmap): InlineResult {
    const importmapJson = JSON.stringify(importmap, null, 2)
    const html = `<!DOCTYPE html>
<html>
<head>
  <script type="importmap">
${importmapJson}
  </script>
</head>
<body>
  <div id="app"></div>
  <script type="module">
${bundleCode}
  </script>
</body>
</html>`

    return {
      html,
      size: html.length,
    }
  }

  validateImportmap(importmap: Importmap): boolean {
    if (!importmap.imports || typeof importmap.imports !== "object") {
      return false
    }

    for (const [key, value] of Object.entries(importmap.imports)) {
      if (typeof key !== "string" || typeof value !== "string") {
        return false
      }
    }

    return true
  }
}
