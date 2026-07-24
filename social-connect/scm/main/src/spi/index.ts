// Thin barrel - each real provider self-registers in its own file
// (justjs.providers.register({concern: "socialConnect", strategy, ...})).
// Mirrors @justjs/cloud-connect's / @justjs/scm-connect's /
// @justjs/comms-connect's spi/index.ts exactly.
import "./mastodon.js";
import "./bluesky.js";
import "./reddit.js";
import "./testsocial.js";
import "./test_dashboard_analytics.js";
