// chat — browser test (auto-generated)
// Source: chat_component.yaml (v1)
// Run:    justw test chat_browser_test.gen.ts --browser
//
// DO NOT EDIT — regenerate with: justw generate component chat

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
  page.waitForSelector('x-chat');

  console.log('1. Chat root element renders');
  const root = page.querySelector('x-chat');
  assert(root !== null, 'Chat root <x-chat> must exist in DOM');

  console.log('2. Chat element context-label is reachable');
  const el_context_label = page.querySelector('[data-addr="context-label"]');
  assert(el_context_label !== null, 'context-label must have DOM address [data-addr="context-label"]');

  console.log('3. Chat element image-error is reachable');
  const el_image_error = page.querySelector('[data-addr="image-error"]');
  assert(el_image_error !== null, 'image-error must have DOM address [data-addr="image-error"]');

  console.log('4. Chat element image-input is reachable');
  const el_image_input = page.querySelector('[data-addr="image-input"]');
  assert(el_image_input !== null, 'image-input must have DOM address [data-addr="image-input"]');

  console.log('5. Chat element image-preview is reachable');
  const el_image_preview = page.querySelector('[data-addr="image-preview"]');
  assert(el_image_preview !== null, 'image-preview must have DOM address [data-addr="image-preview"]');

  console.log('6. Chat element image-thumb is reachable');
  const el_image_thumb = page.querySelector('[data-addr="image-thumb"]');
  assert(el_image_thumb !== null, 'image-thumb must have DOM address [data-addr="image-thumb"]');

  console.log('7. Chat element message-input is reachable');
  const el_message_input = page.querySelector('[data-addr="message-input"]');
  assert(el_message_input !== null, 'message-input must have DOM address [data-addr="message-input"]');

  console.log('8. Chat element messages is reachable');
  const el_messages = page.querySelector('[data-addr="messages"]');
  assert(el_messages !== null, 'messages must have DOM address [data-addr="messages"]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (__err !== '') { console.error('test threw:', __err); process.exit(1); }
if (_failed > 0) { process.exit(1); }
