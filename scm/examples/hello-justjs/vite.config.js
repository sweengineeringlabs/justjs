import { defineConfig } from 'vite'

// @justjs/vite's codegen names strategy packages "@justjs/aop-<concern>-<strategy>"
// (see tooling/vite/scm/main/src/core/codegen.ts), but the aop/* workspaces only
// publish one package per concern and register their strategy at runtime (all
// "noop" today - see justjs#37). These aliases bridge that gap for the generated
// app.gen.ts imports without changing the already-tested codegen package-naming.
const aopNoopAlias = (concern) => ({
  find: `@justjs/aop-${concern}-noop`,
  replacement: `@justjs/aop-${concern}`,
})

export default defineConfig({
  resolve: {
    alias: [
      aopNoopAlias('security'),
      aopNoopAlias('observability'),
      aopNoopAlias('i18n'),
      aopNoopAlias('flags'),
      aopNoopAlias('analytics'),
      aopNoopAlias('theming'),
    ],
  },
  server: {
    port: 3000,
    open: true,
    // justjs#155: dev-time-only proxy to the edge-bootstrap Wasm handler
    // (scm/examples/hello-justjs-egress.rs). edge-bootstrap's HTTP stack
    // has no CORS support anywhere (confirmed: no config surface in
    // RuntimeConfig/RuntimeBuilder, and the vendored edge-runtime-http-
    // adapter doesn't even compile in tower-http's `cors` feature) --
    // Vite's own dev proxy forwards server-side (Node, not subject to
    // browser CORS) so the browser sees a same-origin request. Real
    // deployments won't hit this at all if the app and its Handlers are
    // served from the same origin; flagged as a real, separate gap on
    // edge-bootstrap's side if that's ever not the case.
    proxy: {
      '/api/hello-justjs': {
        target: 'http://127.0.0.1:18895',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/hello-justjs/, '/hello-justjs'),
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022', // top-level await in app.js/app.gen.ts needs >= es2022
  },
})
