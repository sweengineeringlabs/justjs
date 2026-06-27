import type { MeasurementProvider, AllocationReport } from "@justscript/core"
import { AllocationCounter }                          from "./allocation_counter.js"

export class DefaultMeasurementProvider implements MeasurementProvider {
  private readonly _counter  = new AllocationCounter()
  private _gcEventCount      = 0
  private _observer: PerformanceObserver | null = null

  constructor() {
    this._tryAttachGcObserver()
  }

  onConstruct(label: string): void {
    this._counter.onConstruct(label)
  }

  report(): AllocationReport {
    return {
      allocations: {
        ...this._counter.report().allocations,
        "gc.events": this._gcEventCount,
      },
    }
  }

  resetCounter(): void {
    this._counter.resetCounter()
    this._gcEventCount = 0
  }

  dispose(): void {
    this._observer?.disconnect()
  }

  private _tryAttachGcObserver(): void {
    try {
      const observer = new PerformanceObserver(list => {
        this._gcEventCount += list.getEntries().length
      })
      observer.observe({ entryTypes: ["gc"] })
      this._observer = observer
    } catch {
      console.warn(
        "[DefaultMeasurementProvider] PerformanceObserver for 'gc' entries is not available in this environment — GC event counts will not be reported.",
      )
    }
  }
}
