// cartoon — browser test (auto-generated)
// Source: cartoon_component.yaml (v1)
// Run:    justw test cartoon_browser_test.gen.ts --browser
//
// DO NOT EDIT — regenerate with: justw generate component cartoon

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
  page.waitForSelector('x-cartoon');

  console.log('1. Cartoon root element renders');
  const root = page.querySelector('x-cartoon');
  assert(root !== null, 'Cartoon root <x-cartoon> must exist in DOM');

  console.log('2. Cartoon element back-btn is reachable');
  const el_back_btn = page.querySelector('[data-addr="back-btn"]');
  assert(el_back_btn !== null, 'back-btn must have DOM address [data-addr="back-btn"]');

  console.log('3. Cartoon element connect-btn is reachable');
  const el_connect_btn = page.querySelector('[data-addr="connect-btn"]');
  assert(el_connect_btn !== null, 'connect-btn must have DOM address [data-addr="connect-btn"]');

  console.log('4. Cartoon element connect-disclosure is reachable');
  const el_connect_disclosure = page.querySelector('[data-addr="connect-disclosure"]');
  assert(el_connect_disclosure !== null, 'connect-disclosure must have DOM address [data-addr="connect-disclosure"]');

  console.log('5. Cartoon element connect-status is reachable');
  const el_connect_status = page.querySelector('[data-addr="connect-status"]');
  assert(el_connect_status !== null, 'connect-status must have DOM address [data-addr="connect-status"]');

  console.log('6. Cartoon element connect-token is reachable');
  const el_connect_token = page.querySelector('[data-addr="connect-token"]');
  assert(el_connect_token !== null, 'connect-token must have DOM address [data-addr="connect-token"]');

  console.log('7. Cartoon element detail-view is reachable');
  const el_detail_view = page.querySelector('[data-addr="detail-view"]');
  assert(el_detail_view !== null, 'detail-view must have DOM address [data-addr="detail-view"]');

  console.log('8. Cartoon element disconnect-btn is reachable');
  const el_disconnect_btn = page.querySelector('[data-addr="disconnect-btn"]');
  assert(el_disconnect_btn !== null, 'disconnect-btn must have DOM address [data-addr="disconnect-btn"]');

  console.log('9. Cartoon element generate-btn is reachable');
  const el_generate_btn = page.querySelector('[data-addr="generate-btn"]');
  assert(el_generate_btn !== null, 'generate-btn must have DOM address [data-addr="generate-btn"]');

  console.log('10. Cartoon element generate-disclosure is reachable');
  const el_generate_disclosure = page.querySelector('[data-addr="generate-disclosure"]');
  assert(el_generate_disclosure !== null, 'generate-disclosure must have DOM address [data-addr="generate-disclosure"]');

  console.log('11. Cartoon element generate-section is reachable');
  const el_generate_section = page.querySelector('[data-addr="generate-section"]');
  assert(el_generate_section !== null, 'generate-section must have DOM address [data-addr="generate-section"]');

  console.log('12. Cartoon element generate-status is reachable');
  const el_generate_status = page.querySelector('[data-addr="generate-status"]');
  assert(el_generate_status !== null, 'generate-status must have DOM address [data-addr="generate-status"]');

  console.log('13. Cartoon element generated-image is reachable');
  const el_generated_image = page.querySelector('[data-addr="generated-image"]');
  assert(el_generated_image !== null, 'generated-image must have DOM address [data-addr="generated-image"]');

  console.log('14. Cartoon element grid-view is reachable');
  const el_grid_view = page.querySelector('[data-addr="grid-view"]');
  assert(el_grid_view !== null, 'grid-view must have DOM address [data-addr="grid-view"]');

  console.log('15. Cartoon element header-badge is reachable');
  const el_header_badge = page.querySelector('[data-addr="header-badge"]');
  assert(el_header_badge !== null, 'header-badge must have DOM address [data-addr="header-badge"]');

  console.log('16. Cartoon element header-name is reachable');
  const el_header_name = page.querySelector('[data-addr="header-name"]');
  assert(el_header_name !== null, 'header-name must have DOM address [data-addr="header-name"]');

  console.log('17. Cartoon element prompt is reachable');
  const el_prompt = page.querySelector('[data-addr="prompt"]');
  assert(el_prompt !== null, 'prompt must have DOM address [data-addr="prompt"]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (__err !== '') { console.error('test threw:', __err); process.exit(1); }
if (_failed > 0) { process.exit(1); }
