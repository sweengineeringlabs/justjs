import type { DomAddressMap } from "./dom-address.js"

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

export interface JustWebRuntimeMetadata {
  readonly contract: JustWebContractPin
  readonly manifest: JustWebArtifactManifest
  readonly domAddressMap: DomAddressMap
  readonly routes?: readonly string[]
}

/** Opaque runtime capability returned only after mandatory metadata checks. */
export interface ValidatedJustWebContract extends JustWebRuntimeMetadata {}

const validatedContracts = new WeakSet<object>()

export class JustWebContractValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "JustWebContractValidationError"
  }
}

export async function validateJustWebRuntimeMetadata(metadata: JustWebRuntimeMetadata): Promise<ValidatedJustWebContract> {
  const fail = (message: string): never => { throw new JustWebContractValidationError(message) }
  if (!metadata || !metadata.contract || !metadata.manifest || !metadata.domAddressMap?.elements || !Array.isArray(metadata.manifest.artifacts)) {
    fail("A JustWeb contract, manifest, and DOM address map are required.")
  }
  const contract = Object.freeze({ ...metadata.contract })
  const generator = metadata.manifest.generator ? Object.freeze({ ...metadata.manifest.generator }) : undefined
  const manifest = Object.freeze({
    ...metadata.manifest,
    ...(generator ? { generator } : {}),
    artifacts: Object.freeze(metadata.manifest.artifacts.map((artifact) => Object.freeze({ ...artifact }))),
  }) as JustWebArtifactManifest
  const domAddressMap = Object.freeze({
    ...metadata.domAddressMap,
    elements: Object.freeze(Object.fromEntries(Object.entries(metadata.domAddressMap.elements).map(([address, entry]) => [address, Object.freeze({ ...entry })]))),
  }) as DomAddressMap
  const routes = metadata.routes ? Object.freeze([...metadata.routes]) : undefined

  if (manifest.format !== "justweb-artifact-manifest" || manifest.formatVersion !== SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA) {
    fail("A JustWeb artifact manifest with the supported schema is required.")
  }
  if (!generator || generator.name !== "justw" || generator.version !== SUPPORTED_JUSTWEB_GENERATOR_VERSION ||
      generator.revision !== SUPPORTED_JUSTWEB_GENERATOR_REVISION || generator.sourceDirty !== false ||
      contract.generatorVersion !== SUPPORTED_JUSTWEB_GENERATOR_VERSION ||
      contract.generatorRevision !== SUPPORTED_JUSTWEB_GENERATOR_REVISION ||
      contract.artifactSchema !== SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA ||
      contract.generatorVersion !== generator.version || contract.generatorRevision !== generator.revision ||
      contract.artifactSchema !== manifest.formatVersion) {
    fail(`Unsupported JustWeb contract. JustJS requires clean justw ${SUPPORTED_JUSTWEB_GENERATOR_VERSION} at ${SUPPORTED_JUSTWEB_GENERATOR_REVISION}, schema ${SUPPORTED_JUSTWEB_ARTIFACT_SCHEMA}.`)
  }
  if (typeof domAddressMap.elements !== "object") fail("A JustWeb DOM address map is required.")
  if (manifest.artifacts.length === 0) fail("The JustWeb manifest has no artifacts.")

  const paths = new Set<string>()
  for (const artifact of manifest.artifacts) {
    if (!artifact || typeof artifact.path !== "string" || artifact.path.includes("\\") || artifact.path.startsWith("/") || /^[a-zA-Z]:/.test(artifact.path) ||
        artifact.path.split("/").some((part) => part === "" || part === "." || part === "..") ||
        !/^[a-f0-9]{64}$/.test(artifact.sha256) || paths.has(artifact.path)) {
      fail("The JustWeb manifest contains a malformed, non-canonical, or duplicate artifact entry.")
    }
    paths.add(artifact.path)
  }
  const covers = (name: string) => [...paths].some((path) => path.endsWith(name))
  if (!covers("dom-address-map.json") || !covers("registry.gen.ts") || !covers("component-registry.gen.ts")) {
    fail("The JustWeb manifest must cover the DOM address map, registry, and component registry.")
  }
  if ((routes?.length ?? 0) > 0 && (!covers("routes.gen.json") || !covers("routes.gen.ts"))) {
    fail("Routed applications require generated route artifacts in the JustWeb manifest.")
  }
  for (const [address, entry] of Object.entries(domAddressMap.elements)) {
    if (address.split(":").length !== 4 || address.split(":").some((part) => !part) || !entry || typeof entry.tag !== "string" || !entry.tag.includes("-")) {
      fail("Every JustWeb DOM address must resolve to an entry with a registered custom-element tag.")
    }
  }
  const mapDigest = manifest.artifacts.find((artifact) => artifact.path.endsWith("dom-address-map.json"))!.sha256
  const canonicalMap = new TextEncoder().encode(JSON.stringify(domAddressMap, null, 2))
  const digest = await globalThis.crypto.subtle.digest("SHA-256", canonicalMap)
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
  if (actual !== mapDigest) fail("The supplied DOM address map does not match its JustWeb manifest digest.")

  const validated = Object.freeze({
    contract,
    manifest,
    domAddressMap,
    ...(routes ? { routes } : {}),
  })
  validatedContracts.add(validated)
  return validated
}

export function assertValidatedJustWebContract(contract: ValidatedJustWebContract): void {
  if (!contract || !validatedContracts.has(contract)) {
    throw new Error("A validated JustWeb contract capability is required for this public framework factory.")
  }
}
