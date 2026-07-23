// chat — browser E2E test (auto-generated)
// Source: styles/chat_component.yaml (v1)
// Run:    justw test src/features/chat/chat_e2e_test.gen.ts --browser --e2e
//
// Requires: justw serve running (auto-started when justweb.toml present)
// DO NOT EDIT — regenerate with: justw generate component chat

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

console.log('1. Chat root element renders');
page.waitForSelector('x-chat');
const root = page.querySelector('x-chat');
assert(root !== null, 'Chat root <x-chat> must exist in DOM');

console.log('2. Chat element agent-confirm is reachable');
const el_agent_confirm = page.querySelector('[data-addr="agent-confirm"]');
assert(el_agent_confirm !== null, 'agent-confirm must have DOM address [[data-addr="agent-confirm"]]');

console.log('3. Chat element agent-confirm-message is reachable');
const el_agent_confirm_message = page.querySelector('[data-addr="agent-confirm-message"]');
assert(el_agent_confirm_message !== null, 'agent-confirm-message must have DOM address [[data-addr="agent-confirm-message"]]');

console.log('4. Chat element agent-messages is reachable');
const el_agent_messages = page.querySelector('[data-addr="agent-messages"]');
assert(el_agent_messages !== null, 'agent-messages must have DOM address [[data-addr="agent-messages"]]');

console.log('5. Chat element agent-stop-btn is reachable');
const el_agent_stop_btn = page.querySelector('[data-addr="agent-stop-btn"]');
assert(el_agent_stop_btn !== null, 'agent-stop-btn must have DOM address [[data-addr="agent-stop-btn"]]');

console.log('6. Chat element context-label is reachable');
const el_context_label = page.querySelector('[data-addr="context-label"]');
assert(el_context_label !== null, 'context-label must have DOM address [[data-addr="context-label"]]');

console.log('7. Chat element image-error is reachable');
const el_image_error = page.querySelector('[data-addr="image-error"]');
assert(el_image_error !== null, 'image-error must have DOM address [[data-addr="image-error"]]');

console.log('8. Chat element image-input is reachable');
const el_image_input = page.querySelector('[data-addr="image-input"]');
assert(el_image_input !== null, 'image-input must have DOM address [[data-addr="image-input"]]');

console.log('9. Chat element image-preview is reachable');
const el_image_preview = page.querySelector('[data-addr="image-preview"]');
assert(el_image_preview !== null, 'image-preview must have DOM address [[data-addr="image-preview"]]');

console.log('10. Chat element image-thumb is reachable');
const el_image_thumb = page.querySelector('[data-addr="image-thumb"]');
assert(el_image_thumb !== null, 'image-thumb must have DOM address [[data-addr="image-thumb"]]');

console.log('11. Chat element message-input is reachable');
const el_message_input = page.querySelector('[data-addr="message-input"]');
assert(el_message_input !== null, 'message-input must have DOM address [[data-addr="message-input"]]');

console.log('12. Chat element messages is reachable');
const el_messages = page.querySelector('[data-addr="messages"]');
assert(el_messages !== null, 'messages must have DOM address [[data-addr="messages"]]');

console.log('13. Chat element mode-toggle is reachable');
const el_mode_toggle = page.querySelector('[data-addr="mode-toggle"]');
assert(el_mode_toggle !== null, 'mode-toggle must have DOM address [[data-addr="mode-toggle"]]');

} catch (e: unknown) {
  __err = String(e);
}
browser.close();
if (__err !== "") { throw new Error(__err); }
console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (_failed > 0) { process.exit(1); }
