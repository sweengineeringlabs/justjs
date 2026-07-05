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

export const DOM_ADDRESS_MAP = {
  'x-counter': ['hello-justjs:home:x-counter:root'],
  'x-fetch': ['hello-justjs:home:x-fetch:root'],
  'x-form': ['hello-justjs:home:x-form:root'],
}
