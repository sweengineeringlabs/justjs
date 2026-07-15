// workspace — browser test (auto-generated)
// Source: workspace_component.yaml (v1)
// Run:    justw test workspace_browser_test.gen.ts --browser
//
// DO NOT EDIT — regenerate with: justw generate component workspace

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
  page.waitForSelector('x-workspace');

  console.log('1. Workspace root element renders');
  const root = page.querySelector('x-workspace');
  assert(root !== null, 'Workspace root <x-workspace> must exist in DOM');

  console.log('2. Workspace element back-btn is reachable');
  const el_back_btn = page.querySelector('[data-addr="back-btn"]');
  assert(el_back_btn !== null, 'back-btn must have DOM address [data-addr="back-btn"]');

  console.log('3. Workspace element function-list is reachable');
  const el_function_list = page.querySelector('[data-addr="function-list"]');
  assert(el_function_list !== null, 'function-list must have DOM address [data-addr="function-list"]');

  console.log('4. Workspace element function-list-view is reachable');
  const el_function_list_view = page.querySelector('[data-addr="function-list-view"]');
  assert(el_function_list_view !== null, 'function-list-view must have DOM address [data-addr="function-list-view"]');

  console.log('5. Workspace element overview-grid is reachable');
  const el_overview_grid = page.querySelector('[data-addr="overview-grid"]');
  assert(el_overview_grid !== null, 'overview-grid must have DOM address [data-addr="overview-grid"]');

  console.log('6. Workspace element stage-title is reachable');
  const el_stage_title = page.querySelector('[data-addr="stage-title"]');
  assert(el_stage_title !== null, 'stage-title must have DOM address [data-addr="stage-title"]');

  console.log('7. Workspace element subscreen-view is reachable');
  const el_subscreen_view = page.querySelector('[data-addr="subscreen-view"]');
  assert(el_subscreen_view !== null, 'subscreen-view must have DOM address [data-addr="subscreen-view"]');

  console.log('8. Workspace element workspace-view is reachable');
  const el_workspace_view = page.querySelector('[data-addr="workspace-view"]');
  assert(el_workspace_view !== null, 'workspace-view must have DOM address [data-addr="workspace-view"]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (__err !== '') { console.error('test threw:', __err); process.exit(1); }
if (_failed > 0) { process.exit(1); }
