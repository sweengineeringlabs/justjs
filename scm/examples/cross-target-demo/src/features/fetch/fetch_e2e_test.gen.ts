// fetch — browser E2E test (auto-generated)
// Source: styles/fetch_component.yaml (v1)
// Run:    justw test src/features/fetch/fetch_e2e_test.gen.ts --browser --e2e
//
// Requires: justw serve running (auto-started when justweb.toml present)
// DO NOT EDIT — regenerate with: justw generate component fetch

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

console.log('1. Fetch root element renders');
page.waitForSelector('x-fetch');
const root = page.querySelector('x-fetch');
assert(root !== null, 'Fetch root <x-fetch> must exist in DOM');

console.log('2. Fetch element content is reachable');
const el_content = page.querySelector('[data-addr="content"]');
assert(el_content !== null, 'content must have DOM address [[data-addr="content"]]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
if (__err !== "") { throw new Error(__err); }
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (_failed > 0) { process.exit(1); }
