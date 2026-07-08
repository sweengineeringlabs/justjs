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

// justjs#55: boot() now builds a real ComponentRegistry from a lazy map in
// this exact shape (justweb ADR-0008's COMPONENT_REGISTRY, bridged via
// adaptCustomElementRegistry). This demo's components genuinely are native
// custom elements (each file calls customElements.define(...) directly), so
// there's a real registry to build here even without justweb's generated
// component-registry.gen.ts - customElements.get(tag) resolves the same
// constructor once the component's own module has run its side effect.
// Lazy on purpose, matching the real generated shape: these functions don't
// call customElements.get() until adaptCustomElementRegistry's factory
// actually invokes them, by which point app.js has already imported every
// component file for its customElements.define() side effect.
export const COMPONENT_REGISTRY = {
  'x-counter': () => Promise.resolve(customElements.get('x-counter')),
  'x-fetch': () => Promise.resolve(customElements.get('x-fetch')),
  'x-form': () => Promise.resolve(customElements.get('x-form')),
}

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
