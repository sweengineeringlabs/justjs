// connect — native integration test (auto-generated)
// Source: styles/connect_component.yaml (v1)
// Run:    justw test src/features/connect/connect_int_test.gen.ts --native
//
// DO NOT EDIT — regenerate with: justw generate component connect

// Minimal shim: the generated component class extends `HTMLElement`, which
// doesn't exist outside a browser/jsdom. Only the class *declaration* needs
// to resolve for this native test (it never connects the element to a real
// DOM), so an empty extendable stub is enough.
if (typeof (globalThis as { HTMLElement?: unknown }).HTMLElement === 'undefined') {
  (globalThis as { HTMLElement?: unknown }).HTMLElement = class {};
}

import { ConnectBase } from './connect_component.gen';

let _passed = 0;
let _failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) { _passed++; console.log('  PASS:', msg); }
  else { _failed++; console.error('  FAIL:', msg); }
}

function test(name: string, fn: () => void): void {
  try { fn(); }
  catch (e: unknown) { _failed++; console.error('  FAIL:', name, (e as Error).message); }
}

test('connect_module_exports_ConnectBase_class', () => {
  assert(typeof ConnectBase === 'function', 'ConnectBase must be exported as a class/constructor');
});

test('connect_tag_name_is_a_valid_custom_element_name', () => {
  const tag: string = ConnectBase.tagName;
  assert(typeof tag === 'string' && tag.length > 0, 'ConnectBase.tagName must be a non-empty string');
  assert(tag === tag.toLowerCase(), 'custom element tag names must be lowercase, got: ' + tag);
  assert(tag.indexOf('-') > 0, 'custom element tag names must contain a hyphen, got: ' + tag);
});

console.log('\n' + _passed + ' passed, ' + _failed + ' failed');
if (_failed > 0) { process.exit(1); }
