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
  },
  build: {
    outDir: 'dist',
    target: 'es2022', // top-level await in app.js/app.gen.ts needs >= es2022
  },
})
