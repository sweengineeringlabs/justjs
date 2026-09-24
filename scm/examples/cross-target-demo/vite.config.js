import { defineConfig } from "vite";
import { demoUserEndpoint } from "./scripts/demo-user-endpoint.js";

export default defineConfig({
  plugins: [demoUserEndpoint()],
  server: {
    port: 3100,
    open: false,
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
});
