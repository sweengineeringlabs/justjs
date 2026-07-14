// Vite's own convention (vitejs.dev/guide/features.html#static-assets)
// for typing `?raw` imports - tsc has no built-in knowledge of Vite's
// import-suffix conventions. Needed since simple-icons' SVGs are
// imported this way (src/components/workspace.ts).
declare module "*.svg?raw" {
  const content: string;
  export default content;
}
