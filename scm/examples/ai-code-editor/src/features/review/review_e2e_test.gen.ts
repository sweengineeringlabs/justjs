// review — browser E2E test (auto-generated)
// Source: styles/review_component.yaml (v1)
// Run:    justw test src/features/review/review_e2e_test.gen.ts --browser --e2e
//
// Requires: justw serve running (auto-started when justweb.toml present)
// DO NOT EDIT — regenerate with: justw generate component review

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

console.log('1. Review root element renders');
page.waitForSelector('x-review');
const root = page.querySelector('x-review');
assert(root !== null, 'Review root <x-review> must exist in DOM');

console.log('2. Review element findings is reachable');
const el_findings = page.querySelector('[data-addr="findings"]');
assert(el_findings !== null, 'findings must have DOM address [[data-addr="findings"]]');

console.log('3. Review element image-attach is reachable');
const el_image_attach = page.querySelector('[data-addr="image-attach"]');
assert(el_image_attach !== null, 'image-attach must have DOM address [[data-addr="image-attach"]]');

console.log('4. Review element image-picker is reachable');
const el_image_picker = page.querySelector('[data-addr="image-picker"]');
assert(el_image_picker !== null, 'image-picker must have DOM address [[data-addr="image-picker"]]');

console.log('5. Review element reviewed-label is reachable');
const el_reviewed_label = page.querySelector('[data-addr="reviewed-label"]');
assert(el_reviewed_label !== null, 'reviewed-label must have DOM address [[data-addr="reviewed-label"]]');

console.log('6. Review element run-btn is reachable');
const el_run_btn = page.querySelector('[data-addr="run-btn"]');
assert(el_run_btn !== null, 'run-btn must have DOM address [[data-addr="run-btn"]]');

console.log('7. Review element status is reachable');
const el_status = page.querySelector('[data-addr="status"]');
assert(el_status !== null, 'status must have DOM address [[data-addr="status"]]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
if (__err !== "") { throw new Error(__err); }
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (_failed > 0) { process.exit(1); }
