/** Exact file digests produced by `justw generate app`. */
export const SUPPORTED_JUSTWEB_GENERATOR_VERSION = "0.1.0" as const
export const SUPPORTED_JUSTWEB_GENERATOR_REVISION = "64eb51bf4d471261053f6d08dac6db5ce613abd8" as const
export const SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA = 1 as const

export interface JustWebArtifactDigest {
  readonly path: string
  readonly sha256: string
}

export interface JustWebContractPin {
  readonly generatorVersion: "0.1.0"
  readonly generatorRevision: string
  readonly artifactSchema: 1
}

/** Public JustWeb generator output required by every JustJS application. */
export interface JustWebArtifactManifest {
  readonly format: "justweb-artifact-manifest"
  readonly formatVersion: 1
  readonly generator: {
    readonly name: "justw"
    readonly version: string
    readonly revision: string
    readonly sourceDirty: boolean
  }
  readonly artifacts: readonly JustWebArtifactDigest[]
}
