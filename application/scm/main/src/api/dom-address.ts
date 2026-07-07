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

// True when `elements` is non-empty but not one of them carries `tag` —
// the signature of a dom-address-map.json generated before justweb#56, where
// resolving by tag is impossible (not just absent for this one component).
// Callers use this to raise one clear, actionable error instead of a
// generic "no DDAS entry" per component, which would otherwise look
// indistinguishable from a real per-component authoring mistake.
export function isLegacyDomAddressMap(map: DomAddressMap): boolean {
  const elements = Object.values(map.elements)
  return elements.length > 0 && elements.every((element) => element.tag === undefined)
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
