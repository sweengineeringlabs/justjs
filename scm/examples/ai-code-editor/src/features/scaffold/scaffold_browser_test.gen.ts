// scaffold — browser test (auto-generated)
// Source: scaffold_component.yaml (v1)
// Run:    justw test scaffold_browser_test.gen.ts --browser
//
// DO NOT EDIT — regenerate with: justw generate component scaffold

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
  page.waitForSelector('x-scaffold');

  console.log('1. Scaffold root element renders');
  const root = page.querySelector('x-scaffold');
  assert(root !== null, 'Scaffold root <x-scaffold> must exist in DOM');

  console.log('2. Scaffold element code is reachable');
  const el_code = page.querySelector('[data-addr="code"]');
  assert(el_code !== null, 'code must have DOM address [data-addr="code"]');

  console.log('3. Scaffold element description is reachable');
  const el_description = page.querySelector('[data-addr="description"]');
  assert(el_description !== null, 'description must have DOM address [data-addr="description"]');

  console.log('4. Scaffold element file-mode is reachable');
  const el_file_mode = page.querySelector('[data-addr="file-mode"]');
  assert(el_file_mode !== null, 'file-mode must have DOM address [data-addr="file-mode"]');

  console.log('5. Scaffold element file-path is reachable');
  const el_file_path = page.querySelector('[data-addr="file-path"]');
  assert(el_file_path !== null, 'file-path must have DOM address [data-addr="file-path"]');

  console.log('6. Scaffold element generate-btn is reachable');
  const el_generate_btn = page.querySelector('[data-addr="generate-btn"]');
  assert(el_generate_btn !== null, 'generate-btn must have DOM address [data-addr="generate-btn"]');

  console.log('7. Scaffold element generate-project-btn is reachable');
  const el_generate_project_btn = page.querySelector('[data-addr="generate-project-btn"]');
  assert(el_generate_project_btn !== null, 'generate-project-btn must have DOM address [data-addr="generate-project-btn"]');

  console.log('8. Scaffold element mode-toggle is reachable');
  const el_mode_toggle = page.querySelector('[data-addr="mode-toggle"]');
  assert(el_mode_toggle !== null, 'mode-toggle must have DOM address [data-addr="mode-toggle"]');

  console.log('9. Scaffold element project-description is reachable');
  const el_project_description = page.querySelector('[data-addr="project-description"]');
  assert(el_project_description !== null, 'project-description must have DOM address [data-addr="project-description"]');

  console.log('10. Scaffold element project-files is reachable');
  const el_project_files = page.querySelector('[data-addr="project-files"]');
  assert(el_project_files !== null, 'project-files must have DOM address [data-addr="project-files"]');

  console.log('11. Scaffold element project-image-error is reachable');
  const el_project_image_error = page.querySelector('[data-addr="project-image-error"]');
  assert(el_project_image_error !== null, 'project-image-error must have DOM address [data-addr="project-image-error"]');

  console.log('12. Scaffold element project-image-input is reachable');
  const el_project_image_input = page.querySelector('[data-addr="project-image-input"]');
  assert(el_project_image_input !== null, 'project-image-input must have DOM address [data-addr="project-image-input"]');

  console.log('13. Scaffold element project-image-preview is reachable');
  const el_project_image_preview = page.querySelector('[data-addr="project-image-preview"]');
  assert(el_project_image_preview !== null, 'project-image-preview must have DOM address [data-addr="project-image-preview"]');

  console.log('14. Scaffold element project-image-thumb is reachable');
  const el_project_image_thumb = page.querySelector('[data-addr="project-image-thumb"]');
  assert(el_project_image_thumb !== null, 'project-image-thumb must have DOM address [data-addr="project-image-thumb"]');

  console.log('15. Scaffold element project-mode is reachable');
  const el_project_mode = page.querySelector('[data-addr="project-mode"]');
  assert(el_project_mode !== null, 'project-mode must have DOM address [data-addr="project-mode"]');

  console.log('16. Scaffold element project-result is reachable');
  const el_project_result = page.querySelector('[data-addr="project-result"]');
  assert(el_project_result !== null, 'project-result must have DOM address [data-addr="project-result"]');

  console.log('17. Scaffold element replace-confirm is reachable');
  const el_replace_confirm = page.querySelector('[data-addr="replace-confirm"]');
  assert(el_replace_confirm !== null, 'replace-confirm must have DOM address [data-addr="replace-confirm"]');

  console.log('18. Scaffold element replace-message is reachable');
  const el_replace_message = page.querySelector('[data-addr="replace-message"]');
  assert(el_replace_message !== null, 'replace-message must have DOM address [data-addr="replace-message"]');

  console.log('19. Scaffold element result is reachable');
  const el_result = page.querySelector('[data-addr="result"]');
  assert(el_result !== null, 'result must have DOM address [data-addr="result"]');

  console.log('20. Scaffold element status is reachable');
  const el_status = page.querySelector('[data-addr="status"]');
  assert(el_status !== null, 'status must have DOM address [data-addr="status"]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (__err !== '') { console.error('test threw:', __err); process.exit(1); }
if (_failed > 0) { process.exit(1); }
