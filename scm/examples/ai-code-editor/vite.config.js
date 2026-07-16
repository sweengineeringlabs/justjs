import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3201,
    open: false,
  },
  build: {
    outDir: "dist",
    target: "es2022",
    commonjsOptions: {
      // d3-sankey's UMD bundle (pulled in by mermaid) does `require("d3-array")`.
      // Rollup's commonjs resolver doesn't honor d3-sankey's own nested,
      // CJS-compatible d3-array@2 and instead fails resolving the hoisted
      // ESM-only d3-array@3 (no "main"/"require" export condition). Excluding
      // it here defers resolution to Vite's normal exports-aware resolver.
      exclude: [/d3-array/],
    },
  },
});
