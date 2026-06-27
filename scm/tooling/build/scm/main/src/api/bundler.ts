export interface ImportmapEntry {
  [importPath: string]: string
}

export interface Importmap {
  imports: ImportmapEntry
  scopes?: Record<string, ImportmapEntry>
}

export interface BundleConfig {
  entrypoint: string
  outDir: string
  minify?: boolean
}

export interface BundleResult {
  bundleCode: string
  bundleSize: number
}

export interface InlineResult {
  html: string
  size: number
}

export interface BuildConfig {
  bundle?: BundleConfig
  inline?: boolean
  compress?: boolean
}
