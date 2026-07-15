// communication — browser test (auto-generated)
// Source: communication_component.yaml (v1)
// Run:    justw test communication_browser_test.gen.ts --browser
//
// DO NOT EDIT — regenerate with: justw generate component communication

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
  page.waitForSelector('x-communication');

  console.log('1. Communication root element renders');
  const root = page.querySelector('x-communication');
  assert(root !== null, 'Communication root <x-communication> must exist in DOM');

  console.log('2. Communication element connector is reachable');
  const el_connector = page.querySelector('[data-addr="connector"]');
  assert(el_connector !== null, 'connector must have DOM address [data-addr="connector"]');

  console.log('3. Communication element main-view is reachable');
  const el_main_view = page.querySelector('[data-addr="main-view"]');
  assert(el_main_view !== null, 'main-view must have DOM address [data-addr="main-view"]');

  console.log('4. Communication element setting-auto-read is reachable');
  const el_setting_auto_read = page.querySelector('[data-addr="setting-auto-read"]');
  assert(el_setting_auto_read !== null, 'setting-auto-read must have DOM address [data-addr="setting-auto-read"]');

  console.log('5. Communication element setting-default-provider is reachable');
  const el_setting_default_provider = page.querySelector('[data-addr="setting-default-provider"]');
  assert(el_setting_default_provider !== null, 'setting-default-provider must have DOM address [data-addr="setting-default-provider"]');

  console.log('6. Communication element setting-hide-archived is reachable');
  const el_setting_hide_archived = page.querySelector('[data-addr="setting-hide-archived"]');
  assert(el_setting_hide_archived !== null, 'setting-hide-archived must have DOM address [data-addr="setting-hide-archived"]');

  console.log('7. Communication element setting-refresh-interval is reachable');
  const el_setting_refresh_interval = page.querySelector('[data-addr="setting-refresh-interval"]');
  assert(el_setting_refresh_interval !== null, 'setting-refresh-interval must have DOM address [data-addr="setting-refresh-interval"]');

  console.log('8. Communication element settings-back-btn is reachable');
  const el_settings_back_btn = page.querySelector('[data-addr="settings-back-btn"]');
  assert(el_settings_back_btn !== null, 'settings-back-btn must have DOM address [data-addr="settings-back-btn"]');

  console.log('9. Communication element settings-btn is reachable');
  const el_settings_btn = page.querySelector('[data-addr="settings-btn"]');
  assert(el_settings_btn !== null, 'settings-btn must have DOM address [data-addr="settings-btn"]');

  console.log('10. Communication element settings-view is reachable');
  const el_settings_view = page.querySelector('[data-addr="settings-view"]');
  assert(el_settings_view !== null, 'settings-view must have DOM address [data-addr="settings-view"]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (__err !== '') { console.error('test threw:', __err); process.exit(1); }
if (_failed > 0) { process.exit(1); }
