// socials — browser test (auto-generated)
// Source: socials_component.yaml (v1)
// Run:    justw test socials_browser_test.gen.ts --browser
//
// DO NOT EDIT — regenerate with: justw generate component socials

import { Browser, launchBrowser } from '@browser/browser';
import { Page } from '@browser/page';
import { defaultLaunchConfig, findChromeBinary } from '@browser/manager';

let _passed: number = 0;
let _failed: number = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) { _passed++; console.log('  PASS:', msg); }
  else { _failed++; console.error('  FAIL:', msg); }
}

let chrome: string = findChromeBinary();
if (chrome === '') { console.log('Chrome not found'); process.exit(0); }

let browser: Browser = launchBrowser(defaultLaunchConfig());
let __err: string = "";
try {
  let page: Page = browser.newPage();
  page.goto('http://localhost:8090');
  page.waitForSelector('x-socials');

  console.log('1. Socials root element renders');
  const root = page.querySelector('x-socials');
  assert(root !== null, 'Socials root <x-socials> must exist in DOM');

  console.log('2. Socials element connector is reachable');
  const el_connector = page.querySelector('[data-addr="connector"]');
  assert(el_connector !== null, 'connector must have DOM address [data-addr="connector"]');

  console.log('3. Socials element page-header is reachable');
  const el_page_header = page.querySelector('[data-addr="page-header"]');
  assert(el_page_header !== null, 'page-header must have DOM address [data-addr="page-header"]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (__err !== '') { console.error('test threw:', __err); process.exit(1); }
if (_failed > 0) { process.exit(1); }
