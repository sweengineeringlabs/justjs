// Real justweb `dom-address-map.json` shape (confirmed via `justw generate app`
// output, see justjs#38's correction comment) — a flat map keyed by
// colon-delimited hierarchical address strings, not the CSS-selector-list
// shape POC-CONTRACT-SPEC.md previously described.

export interface DomAddressElement {
  readonly component: string
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
