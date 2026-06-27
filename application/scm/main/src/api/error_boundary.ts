export type ComponentErrorPhase = "resolve" | "mount" | "render"

export interface ErrorBoundary {
  canHandle(err: Error, phase: ComponentErrorPhase): boolean
  fallback(err: Error, phase: ComponentErrorPhase): unknown
  onRecover(fn: () => void): () => void
}
