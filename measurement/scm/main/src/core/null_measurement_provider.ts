import type { MeasurementProvider, AllocationReport } from "@justscript/core"

export class NullMeasurementProvider implements MeasurementProvider {
  onConstruct(_label: string): void {}

  report(): AllocationReport {
    return { allocations: {} }
  }

  resetCounter(): void {}
}
