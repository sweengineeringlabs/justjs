import type { ComponentProps, Component } from "../../api/component.js"
import { DefaultComponentRegistry } from "./component_registry.js"

// justweb's `component-registry.gen.ts` (ADR-0008) exports this exact shape —
// a plain, lazy, enumerable map keyed by tag. `CustomElementConstructor` is the
// standard DOM-lib type (lib.dom.d.ts), not a justjs type.
export type LazyCustomElementRegistry = Record<string, () => Promise<CustomElementConstructor>>

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
// holds something else entirely.
export function adaptCustomElementRegistry(source: LazyCustomElementRegistry): DefaultComponentRegistry {
  const registry = new DefaultComponentRegistry()

  for (const [tag, load] of Object.entries(source)) {
    registry.register(tag, async (): Promise<Component> => {
      const ElementCtor = await load()
      return {
        name: tag,
        render(renderProps: ComponentProps, container: Element): void {
          const existing = container.firstElementChild
          const reusable = existing instanceof ElementCtor
          const element = reusable ? existing : new ElementCtor()
          for (const [key, value] of Object.entries(renderProps)) {
            element.setAttribute(key, String(value))
          }
          if (!reusable) {
            container.replaceChildren(element)
          }
        },
      }
    })
  }

  return registry
}
