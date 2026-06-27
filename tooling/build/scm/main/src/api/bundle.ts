export interface ImportMap {
  readonly imports: Record<string, string>
}

export interface BundleConfig {
  readonly entryPoint: string
  readonly outFile: string
  readonly importmap: ImportMap
}

export interface BundleResult {
  readonly code: string
  readonly size: number
  readonly importsUsed: readonly string[]
}

export interface HtmlOutput {
  readonly html: string
  readonly importmapScript: string
  readonly bundleScript: string
}

export class BuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BuildError"
  }
}
