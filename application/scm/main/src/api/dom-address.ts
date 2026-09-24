// Real justweb `dom-address-map.json` shape (confirmed via `justw generate app`
// output, see justjs#38's correction comment) — a flat map keyed by
// colon-delimited hierarchical address strings, not the CSS-selector-list
// shape POC-CONTRACT-SPEC.md previously described.

export interface DomAddressElement {
  readonly component: string
  // Actually-registered custom-element tag (justweb#56) — resolve against
  // this, not `component` (the bare *_component.yaml name), to match a
  // customElements/COMPONENT_REGISTRY entry. It is mandatory for the
  // supported JustWeb manifest schema.
  readonly tag: string
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

// Every DDAS address whose `tag` matches the given component tag.
export function resolveDdasAddressesForTag(map: DomAddressMap, tag: string): string[] {
  return Object.entries(map.elements)
    .filter(([, element]) => element.tag === tag)
    .map(([address]) => address)
}

// The set of every component tag with at least one DDAS address.
export function resolveDdasKnownTags(map: DomAddressMap): Set<string> {
  return new Set(
    Object.values(map.elements)
      .map((element) => element.tag)
      .filter((tag): tag is string => tag !== undefined)
  )
}
