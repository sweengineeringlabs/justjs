// scaffold — browser E2E test (auto-generated)
// Source: styles/scaffold_component.yaml (v1)
// Run:    justw test src/features/scaffold/scaffold_e2e_test.gen.ts --browser --e2e
//
// Requires: justw serve running (auto-started when justweb.toml present)
// DO NOT EDIT — regenerate with: justw generate component scaffold

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

console.log('1. Scaffold root element renders');
page.waitForSelector('x-scaffold');
const root = page.querySelector('x-scaffold');
assert(root !== null, 'Scaffold root <x-scaffold> must exist in DOM');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
if (__err !== "") { throw new Error(__err); }
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (_failed > 0) { process.exit(1); }
