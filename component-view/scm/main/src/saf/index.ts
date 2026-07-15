export type { BadgeViewProps } from "../api/badge_view.js";

// Type-only export, for callers to type a `document.createElement("view-badge")`/
// `querySelector` result (e.g. `el as BadgeView`) - the same idiomatic
// pattern `lib.dom.d.ts` itself uses (`createElement("div")` returns the
// concrete `HTMLDivElement` type). Erased at compile time, so this does
// not let a caller `new BadgeView()` or otherwise construct one outside
// `customElements.define` - core_not_exported_directly (ADR-0001) is
// about concrete value/construction exports, not type-only casts.
export type { BadgeView } from "../core/badge_view.js";

// customElements.define("view-badge", ...) is a real module-load side
// effect inside core/badge_view.ts - importing it here is what
// self-registers the tag when a host does
// `import "@justjs/component-view"`. Not re-exported as a concrete
// class name (core_not_exported_directly, ADR-0001's own rule) - a
// caller reaches it only via the tag name / DOM API, never a class
// import.
import "../core/badge_view.js";
