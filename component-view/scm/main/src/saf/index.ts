export type { BadgeViewProps } from "../api/badge_view.js";
export type { NavHeaderViewProps } from "../api/nav_header_view.js";
export type { StatusLineViewProps } from "../api/status_line_view.js";
export type { ImageAttachViewProps } from "../api/image_attach_view.js";
export type { ImagePickerViewProps } from "../api/image_picker_view.js";

// Type-only export, for callers to type a `document.createElement("view-badge")`/
// `querySelector` result (e.g. `el as BadgeView`) - the same idiomatic
// pattern `lib.dom.d.ts` itself uses (`createElement("div")` returns the
// concrete `HTMLDivElement` type). Erased at compile time, so this does
// not let a caller `new BadgeView()` or otherwise construct one outside
// `customElements.define` - core_not_exported_directly (ADR-0001) is
// about concrete value/construction exports, not type-only casts.
export type { BadgeView } from "../core/badge_view.js";
export type { NavHeaderView } from "../core/nav_header_view.js";
export type { StatusLineView } from "../core/status_line_view.js";
export type { ImageAttachView } from "../core/image_attach_view.js";
export type { ImagePickerView } from "../core/image_picker_view.js";

// customElements.define("view-badge"/"view-nav-header"/
// "view-status-line"/"view-image-attach"/"view-image-picker", ...) are
// real module-load side effects inside core/*.ts - importing them here
// is what self-registers each tag when a host does
// `import "@justjs/component-view"`. Not re-exported as concrete class
// names (core_not_exported_directly, ADR-0001's own rule) - a caller
// reaches them only via the tag name / DOM API, never a class import.
import "../core/badge_view.js";
import "../core/nav_header_view.js";
import "../core/status_line_view.js";
import "../core/image_attach_view.js";
import "../core/image_picker_view.js";
