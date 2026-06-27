export interface AllocationReport {
  readonly allocations: Record<string, number>
}

export interface MeasurementProvider {
  onConstruct(label: string): void
  report(): AllocationReport
  resetCounter(): void
}

export interface MeasurementRegistry {
  current: MeasurementProvider | null
  register(provider: MeasurementProvider): void
  unregister(): void
}
