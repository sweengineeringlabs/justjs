import type { MeasurementProvider, MeasurementRegistry } from "../api/measurement.js"

class DefaultMeasurementRegistry implements MeasurementRegistry {
  current: MeasurementProvider | null = null

  register(provider: MeasurementProvider): void {
    this.current = provider
  }

  unregister(): void {
    this.current = null
  }
}

export const measurementRegistry: MeasurementRegistry = new DefaultMeasurementRegistry()
