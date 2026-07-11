import { createMemoryProvider } from "@justjs/memory";

// One shared instance for the whole app - imported directly by app.ts
// and each component (same module-level-singleton pattern
// @justjs/application's own `justjs` export uses), not threaded through
// dataContext (whose real shape is fixed to {store?, eventBus?} - see
// component_registry_adapter.ts's toDataContext()). If each view called
// createMemoryProvider() itself, each would get its own separate
// in-memory Map and writes from one view wouldn't be visible in another
// until a full page reload.
//
// staleAfterMsForForgetting is demo-tuned down from the 30-day
// production default to 60s, so the curation view's forgetting
// heuristic is actually observable in a verification pass without
// waiting a month - a real app would omit this override entirely.
export const memoryProvider = createMemoryProvider({ staleAfterMsForForgetting: 60_000 });
