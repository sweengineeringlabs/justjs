// Preloaded before any test file's own imports run (see bunfig.toml's
// [test].preload) - necessary because some modules (e.g.
// core/socials_credentials.ts, via @justjs/provider-connect's
// component-view dependency) define classes with `extends HTMLElement`
// at their own module top level. A class-extends clause evaluates the
// moment that module is loaded, not when the class is later
// instantiated - unlike a same-file happy-dom shim placed between two
// import statements (@justjs/comms-connect's own int test's DOMParser
// shim), which only works because DOMParser there is referenced inside
// a function body, never at module-evaluation time. Real browsers/
// WebViews always have these globals; only this headless `bun test`
// sandbox doesn't.
import { Window } from "happy-dom";

const happyWindow = new Window();
(globalThis as { HTMLElement?: unknown }).HTMLElement = happyWindow.HTMLElement;
(globalThis as { customElements?: unknown }).customElements = happyWindow.customElements;
(globalThis as { DOMParser?: unknown }).DOMParser = happyWindow.DOMParser;
// Without this, core/socials_credentials.ts's (and cartoon_credentials.ts's
// etc.) `globalThis.localStorage?.setItem(...)` calls silently no-op
// (optional chaining on undefined) - any test that round-trips a real
// stored token/credential passes or fails for the wrong reason. Real
// bug this exact gap caused: core/socials_analytics_test.ts's "failing
// token" test read back "" instead of the token it had just "set".
(globalThis as { localStorage?: unknown }).localStorage = happyWindow.localStorage;
