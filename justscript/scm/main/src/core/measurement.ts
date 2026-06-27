import type { MeasurementProvider, AllocationReport, MeasurementRegistry } from "../api/measurement.js"

export class AllocationCounter implements MeasurementProvider {
  private readonly _counts: Record<string, number> = {}

  onConstruct(label: string): void {
    this._counts[label] = (this._counts[label] ?? 0) + 1
  }

  report(): AllocationReport {
    return { allocations: { ...this._counts } }
  }

  resetCounter(): void {
    for (const key of Object.keys(this._counts)) {
      delete this._counts[key]
    }
  }
}

class DefaultMeasurementRegistry implements MeasurementRegistry {
  current: MeasurementProvider | null = null

  install(provider: MeasurementProvider): void {
    this.current = provider
  }

  uninstall(): void {
    this.current = null
  }
}

export const measurementRegistry: MeasurementRegistry = new DefaultMeasurementRegistry()
