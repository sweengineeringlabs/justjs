export type { AllocationReport, MeasurementReport, MeasurementProvider, MeasurementRegistry } from "../api/measurement.js"
export { measurementRegistry }         from "../spi/index.js"

import type { MeasurementProvider } from "../api/measurement.js"
import { AllocationCounter } from "../core/allocation_counter.js"
import { NullMeasurementProvider } from "../core/null_measurement_provider.js"
import { DefaultMeasurementProvider } from "../core/default_measurement_provider.js"

// Factories, not direct class re-exports (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// MeasurementProvider contract, never the concrete class name.
export function createAllocationCounter(): MeasurementProvider {
  return new AllocationCounter()
}

export function createNullMeasurementProvider(): MeasurementProvider {
  return new NullMeasurementProvider()
}

export function createMeasurementProvider(): MeasurementProvider {
  return new DefaultMeasurementProvider()
}
