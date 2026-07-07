import type { ComponentProps, Component } from "../../api/component.js"
import { DefaultComponentRegistry } from "./component_registry.js"

// justweb's `component-registry.gen.ts` (ADR-0008) exports this exact shape —
// a plain, lazy, enumerable map keyed by tag. `CustomElementConstructor` is the
// standard DOM-lib type (lib.dom.d.ts), not a justjs type.
export type LazyCustomElementRegistry = Record<string, () => Promise<CustomElementConstructor>>

// Bridges justweb's generic COMPONENT_REGISTRY shape into @justjs/application's
// own DefaultComponentRegistry. Per justweb ADR-0008, deciding this bridge is
// explicitly justjs's call, not justweb's — justweb emits a lazy constructor
// loader with no opinion about how a consumer instantiates or mounts it.
//
// Scope of this adapter: translate the *factory* shape (tag -> lazy
// CustomElementConstructor) into DefaultComponentRegistry's factory shape
// (tag -> (props?) => Component); construct the custom element, apply props
// as attributes (the only wiring mechanism justweb's generated components
// currently support — see justweb ADR-0006 rev.4: only `states:` -> attribute
// flows, and only at initial construction), and attach it into the container
// RenderStep resolved (justjs#48). `replaceChildren` makes re-render
// idempotent — a second render() call swaps in a fresh element rather than
// accumulating stale ones alongside it.
export function adaptCustomElementRegistry(source: LazyCustomElementRegistry): DefaultComponentRegistry {
  const registry = new DefaultComponentRegistry()

  for (const [tag, load] of Object.entries(source)) {
    registry.register(tag, async (): Promise<Component> => {
      const ElementCtor = await load()
      return {
        name: tag,
        render(renderProps: ComponentProps, container: Element): void {
          const element = new ElementCtor()
          for (const [key, value] of Object.entries(renderProps)) {
            element.setAttribute(key, String(value))
          }
          container.replaceChildren(element)
        },
      }
    })
  }

  return registry
}
