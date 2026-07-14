// Thin barrel - each real provider self-registers in its own file
// (justjs.providers.register({concern: "pmConnect", strategy, ...})).
// Mirrors every sibling *-connect package's spi/index.ts exactly.
import "./linear.js";
import "./asana.js";
import "./trello.js";
import "./jira.js";
