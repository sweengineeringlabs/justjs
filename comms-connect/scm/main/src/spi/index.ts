// Thin barrel - each real provider self-registers in its own file
// (justjs.providers.register({concern: "commsConnect", strategy, ...})).
// Mirrors @justjs/cloud-connect's / @justjs/scm-connect's spi/index.ts
// exactly.
import "./slack.js";
import "./discord.js";
import "./teams.js";
