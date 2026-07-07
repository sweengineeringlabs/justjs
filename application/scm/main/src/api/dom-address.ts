// Real justweb `dom-address-map.json` shape (confirmed via `justw generate app`
// output, see justjs#38's correction comment) — a flat map keyed by
// colon-delimited hierarchical address strings, not the CSS-selector-list
// shape POC-CONTRACT-SPEC.md previously described.

export interface DomAddressElement {
  readonly component: string
  // Actually-registered custom-element tag (justweb#56) — resolve against
  // this, not `component` (the bare *_component.yaml name), to match a
  // customElements/COMPONENT_REGISTRY entry. Optional: older justweb output
  // predating justweb#56 won't have it, so a missing `tag` correctly fails
  // to match rather than silently comparing against the wrong field.
  readonly tag?: string
  readonly feature?: string
  readonly interactive?: boolean
  readonly scope?: string
  readonly type?: string
}

export interface DomAddressMap {
  readonly app?: string
  readonly elements: Record<string, DomAddressElement>
  readonly schema?: string
  readonly version?: string
}
