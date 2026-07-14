// Thin barrel - each real provider self-registers in its own file
// (justjs.providers.register({concern: "cloudConnect", strategy, ...}),
// same call shape @justjs/ai-assist's own spi/index.ts uses for its one
// "anthropic" strategy). Importing this module pulls in all 7 for their
// registration side effects; saf/index.ts imports this file for exactly
// that reason, matching @justjs/ai-assist's own working pattern (unlike
// aop-security's spi/index.ts, which is dead code - no "./spi" exports
// subpath, never imported from its own saf/index.ts).
import "./digitalocean.js";
import "./netlify.js";
import "./vercel.js";
import "./heroku.js";
import "./azure.js";
import "./gcp.js";
import "./aws.js";
