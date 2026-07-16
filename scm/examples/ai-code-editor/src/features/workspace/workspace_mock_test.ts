// Real usage test for justw's generated workspace_mock.gen.ts (justjs#96).
// populateWorkspace()/sampleData were generated but never imported or
// exercised anywhere in this app - this proves the generated mock actually
// does what its own source claims against a real DOM (happy-dom, same
// technique verify_web.mjs already uses), not just "it compiled."

import { test, expect } from "bun:test";
import { Window } from "happy-dom";
import { populateWorkspace, sampleData } from "./workspace_mock.gen.js";

function buildWorkspaceDom(): HTMLElement {
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = `
    <div id="workspace-view" data-part="workspace-view"></div>
    <div id="overview-grid" data-part="overview-grid"></div>
    <div id="function-list-view" data-part="function-list-view"></div>
    <button id="back-btn" data-part="back-btn">← Workspace</button>
    <h2 id="stage-title" data-part="stage-title"></h2>
    <div id="function-list" data-part="function-list"></div>
    <div id="subscreen-view" data-part="subscreen-view"></div>
  `;
  return document.body as unknown as HTMLElement;
}

test("test_populate_workspace_fills_every_non_button_element_with_its_sample_value", () => {
  const root = buildWorkspaceDom();
  populateWorkspace(root);

  expect(root.querySelector("[data-part='workspace-view']")?.textContent).toBe(sampleData.workspaceView);
  expect(root.querySelector("[data-part='overview-grid']")?.textContent).toBe(sampleData.overviewGrid);
  expect(root.querySelector("[data-part='function-list-view']")?.textContent).toBe(sampleData.functionListView);
  expect(root.querySelector("[data-part='stage-title']")?.textContent).toBe(sampleData.stageTitle);
  expect(root.querySelector("[data-part='function-list']")?.textContent).toBe(sampleData.functionList);
  expect(root.querySelector("[data-part='subscreen-view']")?.textContent).toBe(sampleData.subscreenView);
});

test("test_populate_workspace_does_not_touch_back_btn_buttons_are_intentionally_skipped", () => {
  // webschema's mockgen.rs deliberately skips <button> elements in
  // populate() (real content, not stubbed - "buttons don't need sample
  // data") while still declaring a sampleData.backBtn value for a
  // consumer that wants it directly. Confirms that split holds for real,
  // not just by reading the codegen source.
  const root = buildWorkspaceDom();
  const backBtn = root.querySelector("[data-part='back-btn']");
  const originalText = backBtn?.textContent;

  populateWorkspace(root);

  expect(backBtn?.textContent).toBe(originalText);
  expect(backBtn?.textContent).not.toBe(sampleData.backBtn);
});

test("test_populate_workspace_is_a_noop_on_missing_elements_not_a_throw", () => {
  // A caller populating a partial/not-yet-fully-rendered DOM (e.g. only
  // the overview grid mounted so far) must not crash - every querySelector
  // result is null-guarded in the generated function.
  const window = new Window();
  const document = window.document;
  document.body.innerHTML = `<div data-part="overview-grid"></div>`;
  const root = document.body as unknown as HTMLElement;

  expect(() => populateWorkspace(root)).not.toThrow();
  expect(root.querySelector("[data-part='overview-grid']")?.textContent).toBe(sampleData.overviewGrid);
});
