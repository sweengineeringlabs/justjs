// Stand-in for the routes.gen.json / registry.gen.ts / dom-address-map.json
// that justweb would normally generate (see ADR-0001 §DDAS). This demo
// hand-writes its components instead of running justweb (see justjs#37),
// so these are authored by hand to match src/components/*.js exactly.

export const ROUTES = ['/counter', '/fetch', '/form']

export const REGISTRY = {
  'x-counter': { path: '/counter', component: 'CounterComponent' },
  'x-fetch': { path: '/fetch', component: 'FetchDemoComponent' },
  'x-form': { path: '/form', component: 'FormDemoComponent' },
}

// Not exercising @justjs/application's adaptCustomElementRegistry (justjs#46)
// here: this demo's components are hand-authored plain classes, not native
// custom elements behind a lazy COMPONENT_REGISTRY loader (justweb ADR-0008),
// so there's nothing in this shape for that adapter to bridge. Wiring
// hello-justjs through a real justweb-generated COMPONENT_REGISTRY is its own
// follow-up, tracked by justjs#39/#41.

// Real justweb dom-address-map.json shape: flat map keyed by hierarchical
// address string, with per-element metadata (see justjs#38's correction and
// application's DomAddressMap type, application/scm/main/src/api/dom-address.ts).
// `tag` (justweb#56) is the actually-registered custom-element tag - what
// MountStep resolves against; `component` is the bare pre-prefix name and is
// never compared against a registry tag.
export const DOM_ADDRESS_MAP = {
  elements: {
    'hello-justjs:home:x-counter:root': { component: 'counter', tag: 'x-counter', feature: 'home' },
    'hello-justjs:home:x-fetch:root': { component: 'fetch', tag: 'x-fetch', feature: 'home' },
    'hello-justjs:home:x-form:root': { component: 'form', tag: 'x-form', feature: 'home' },
  },
}
