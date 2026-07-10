import type { ComponentProps, Component, ComponentDataContext } from "../../api/component.js"
import type { LazyCustomElementRegistry, MutableComponentRegistry } from "../../api/registry.js"
import { DefaultComponentRegistry } from "./component_registry.js"

// A named function, not an inline cast-and-assign expression statement -
// justc 0.3.4's iife/cjs bundler was found to drop that whole statement
// (and the render() parameter feeding it) somewhere in the full production
// bundle graph, despite compiling correctly in every smaller isolated
// repro tried while diagnosing justjs#71 - narrowing the exact trigger
// further wasn't practical within that investigation's time budget.
// Extracting to a named function matches the pattern that already fixed
// two other justc bugs in this file (async arrow -> named async function);
// confirmed this one also survives real-bundle compilation where the
// inline version didn't.
function assignDataContext(element: Element, dataContext: ComponentDataContext | undefined): void {
  ;(element as unknown as { dataContext?: ComponentDataContext | undefined }).dataContext = dataContext
}

// Bridges justweb's generic COMPONENT_REGISTRY shape into @justjs/application's
// DefaultComponentRegistry — the registry type RenderStep/UpdateStep actually
// consume via `.get()` (justjs#50; a plain Record shape used to exist in
// parallel and was never read by the lifecycle at all). Per justweb ADR-0008,
// deciding this bridge is explicitly justjs's call, not justweb's — justweb
// emits a lazy constructor loader with no opinion about how a consumer
// instantiates or mounts it.
//
// Scope of this adapter: translate the *factory* shape (tag -> lazy
// CustomElementConstructor) into DefaultComponentRegistry's factory shape
// (tag -> (props?) => Component); construct the custom element, apply props
// as attributes, and attach it into the container RenderStep resolved
// (justjs#48). Hyphenated-tag validation is DefaultComponentRegistry's own
// (`.register()` throws `RegistryError` for a non-hyphenated tag).
//
// Reuses the container's existing child across repeated render() calls when
// it's already an instance of the same ElementCtor, instead of always
// reconstructing - justweb#52 wired declared `props:` to a real
// attributeChangedCallback -> signal flow, so setAttribute on an
// already-connected element is no longer inert the way ADR-0006 rev.4
// documented for `states:` alone. Falls back to a fresh element (and
// replaces the container's contents) on first render or if the container
// holds something else entirely. A prop present in a previous render but
// absent from the current one is actively removed (not just left stale)
// when reusing the same element.
//
// Known limitation: reuse detection is purely structural (`instanceof
// ElementCtor`), with no per-instance identity/key. A container that
// already holds an unrelated element of the same custom-element class
// (e.g. genuine pre-existing light-DOM content, or the same tag mounted
// into a reused container across two logically distinct instances) would
// be treated as reusable and re-propped rather than recognized as a
// different logical instance. No caller in this codebase currently passes
// a non-empty container, so this hasn't been a live bug - flagging it here
// rather than leaving it undocumented.
// A named async function, not an inline `async () => {}` passed directly to
// registry.register() - justc 0.3.4's iife/cjs bundle-lowering strips the
// `async` modifier off arrow function expressions (confirmed via a minimal
// repro isolated from this exact call site; async function *declarations*
// are unaffected), which turns the `await load()` below into a real syntax
// error in the emitted bundle. registry.register() itself still gets a
// plain (non-async) arrow that just forwards to this function and returns
// its promise - no `await` inside that outer arrow, so it isn't affected.
async function resolveComponent(
  tag: string,
  load: () => Promise<CustomElementConstructor>
): Promise<Component> {
  const ElementCtor = await load()
  // `new ElementCtor()` below throws "Illegal constructor" against a real
  // DOM for an autonomous custom element class that was never passed to
  // customElements.define() — confirmed against happy-dom while building
  // ADR-0005 (justjs#63/#64). Self-registering here, rather than assuming
  // the module behind `load()` already did it, matches the same fix
  // applied in @justjs/ssr's renderComponent() (tooling/ssr/scm/main/src/
  // core/renderer.ts) so both server- and client-side construction of the
  // same class are equally safe regardless of that module's own behavior.
  // Guarded on `customElements` existing at all — this codebase's own
  // non-DOM unit tests construct plain JS stand-ins with no global DOM
  // present, and must keep working unchanged.
  if (typeof customElements !== "undefined" && !customElements.get(tag)) {
    customElements.define(tag, ElementCtor)
  }
  let previousKeys = new Set<string>()
  return {
    name: tag,
    // dataContext (ctx.store/ctx.eventBus, ADR-0004) used to be silently
    // dropped here - this render() only ever declared 2 params, so
    // RenderStep/UpdateStep's 3rd call argument was discarded before
    // justjs#71 found it. That left ADR-0004's re-render mechanism with no
    // real path to ever reach a customElements-registered component - the
    // only kind justweb codegen actually produces - since the mechanism
    // depends entirely on a component reading fresh state off ctx.store
    // itself (ADR-0004: "the component reads fresh state directly off
    // ctx.store... no stale-closure risk"), and there was nowhere for a
    // custom element to read it from. Assigning it as a plain
    // `dataContext` property, not inventing a new lifecycle callback: a
    // custom element that wants reactivity defines its own
    // `set dataContext(ctx)` accessor and re-renders itself when it fires,
    // the same get/set-accessor idiom real justweb codegen already uses
    // for declared props/states (see ButtonBase's checked/loading/etc.).
    // A no-op, not a silent failure, for elements that don't define one.
    render(renderProps: ComponentProps, container: Element, dataContext?: ComponentDataContext): void {
      const existing = container.firstElementChild
      const reusable = existing instanceof ElementCtor
      const element = reusable ? existing : new ElementCtor()
      const nextKeys = new Set(Object.keys(renderProps))
      if (reusable) {
        for (const key of previousKeys) {
          if (!nextKeys.has(key)) {
            element.removeAttribute(key)
          }
        }
      }
      for (const [key, value] of Object.entries(renderProps)) {
        element.setAttribute(key, String(value))
      }
      previousKeys = nextKeys
      assignDataContext(element, dataContext)
      if (!reusable) {
        container.replaceChildren(element)
      }
    },
  }
}

export function adaptCustomElementRegistry(source: LazyCustomElementRegistry): MutableComponentRegistry {
  const registry = new DefaultComponentRegistry()

  for (const [tag, load] of Object.entries(source)) {
    registry.register(tag, () => resolveComponent(tag, load))
  }

  return registry
}
