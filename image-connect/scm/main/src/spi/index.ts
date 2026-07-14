// Thin barrel - each real provider self-registers in its own file
// (justjs.providers.register({concern: "imageConnect", strategy, ...})).
// Mirrors every sibling *-connect package's spi/index.ts exactly.
import "./openai.js";
import "./stability.js";
import "./gemini.js";
