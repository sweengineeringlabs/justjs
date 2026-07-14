// Thin barrel - each real provider self-registers in its own file
// (justjs.providers.register({concern: "scmConnect", strategy, ...})).
// Importing this module pulls in all 3 for their registration side
// effects; saf/index.ts imports this file for exactly that reason.
// Mirrors @justjs/cloud-connect's spi/index.ts exactly.
import "./github.js";
import "./gitlab.js";
import "./bitbucket.js";
