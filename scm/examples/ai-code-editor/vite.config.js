import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3201,
    open: false,
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
