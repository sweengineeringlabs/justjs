// Runs @justjs/vite's codegen against justjs.config.toml, producing
// src/core/app.gen.ts. See justjs#37 - this proves the vite-plugin ->
// generated-app.ts -> JustJS.boot() pipeline actually runs end to end.
import { runCodegen } from '@justjs/vite'

await runCodegen()
