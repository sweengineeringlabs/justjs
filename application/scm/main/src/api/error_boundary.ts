import type { ComponentContext } from "./component.js"

// Called when a component's render()/update() throws during a real
// lifecycle.run() pass — the initial navigation, or a reactive re-render
// (ADR-0004). Given the same ctx.element the component was mounted into,
// so a boundary can replace the broken content with a fallback; what
// "recovered" looks like is the boundary's call, this contract only gives
// it the chance to make one.
//
// Deliberately scoped to RenderStep/UpdateStep only — component-authored
// code, not framework-internal steps (Resolve/Mount/Unmount). An error
// from those is a real framework/config bug and should keep surfacing
// loudly, not be silently absorbed by a boundary meant for component
// failures.
export interface ErrorBoundary {
  onError(error: unknown, ctx: ComponentContext): void
}
