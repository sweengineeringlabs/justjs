// editor — browser E2E test (auto-generated)
// Source: styles/editor_component.yaml (v1)
// Run:    justw test src/features/editor/editor_e2e_test.gen.ts --browser --e2e
//
// Requires: justw serve running (auto-started when justweb.toml present)
// DO NOT EDIT — regenerate with: justw generate component editor

import { Browser, launchBrowser } from '@browser/browser';
import { Page } from '@browser/page';
import { defaultLaunchConfig } from '@browser/manager';

let _passed = 0;
let _failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) { _passed++; console.log('  PASS:', msg); }
  else { _failed++; console.error('  FAIL:', msg); }
}

const browser: Browser = launchBrowser(defaultLaunchConfig());
let __err: string = "";
try {
const page: Page = browser.newPage();
page.goto('http://localhost:8080');

console.log('1. Editor root element renders');
page.waitForSelector('x-editor');
const root = page.querySelector('x-editor');
assert(root !== null, 'Editor root <x-editor> must exist in DOM');

console.log('2. Editor element gutter is reachable');
const el_gutter = page.querySelector('[data-addr="gutter"]');
assert(el_gutter !== null, 'gutter must have DOM address [[data-addr="gutter"]]');

console.log('3. Editor element highlight is reachable');
const el_highlight = page.querySelector('[data-addr="highlight"]');
assert(el_highlight !== null, 'highlight must have DOM address [[data-addr="highlight"]]');

console.log('4. Editor element highlight-code is reachable');
const el_highlight_code = page.querySelector('[data-addr="highlight-code"]');
assert(el_highlight_code !== null, 'highlight-code must have DOM address [[data-addr="highlight-code"]]');

console.log('5. Editor element language-select is reachable');
const el_language_select = page.querySelector('[data-addr="language-select"]');
assert(el_language_select !== null, 'language-select must have DOM address [[data-addr="language-select"]]');

console.log('6. Editor element review-btn is reachable');
const el_review_btn = page.querySelector('[data-addr="review-btn"]');
assert(el_review_btn !== null, 'review-btn must have DOM address [[data-addr="review-btn"]]');

console.log('7. Editor element sidebar-error is reachable');
const el_sidebar_error = page.querySelector('[data-addr="sidebar-error"]');
assert(el_sidebar_error !== null, 'sidebar-error must have DOM address [[data-addr="sidebar-error"]]');

console.log('8. Editor element sidebar-tree is reachable');
const el_sidebar_tree = page.querySelector('[data-addr="sidebar-tree"]');
assert(el_sidebar_tree !== null, 'sidebar-tree must have DOM address [[data-addr="sidebar-tree"]]');

console.log('9. Editor element status is reachable');
const el_status = page.querySelector('[data-addr="status"]');
assert(el_status !== null, 'status must have DOM address [[data-addr="status"]]');

console.log('10. Editor element suggest-btn is reachable');
const el_suggest_btn = page.querySelector('[data-addr="suggest-btn"]');
assert(el_suggest_btn !== null, 'suggest-btn must have DOM address [[data-addr="suggest-btn"]]');

console.log('11. Editor element surface is reachable');
const el_surface = page.querySelector('[data-addr="surface"]');
assert(el_surface !== null, 'surface must have DOM address [[data-addr="surface"]]');

console.log('12. Editor element textarea is reachable');
const el_textarea = page.querySelector('[data-addr="textarea"]');
assert(el_textarea !== null, 'textarea must have DOM address [[data-addr="textarea"]]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
if (__err !== "") { throw new Error(__err); }
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (_failed > 0) { process.exit(1); }
