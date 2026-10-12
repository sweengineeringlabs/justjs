export interface ImportScanner {
  /** Sorted, unique non-relative ES module specifiers discoverable statically. */
  scan(code: string): string[]
}
