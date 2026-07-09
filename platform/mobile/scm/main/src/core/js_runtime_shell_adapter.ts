import type { RuntimeAdapter, MountHandle } from "@justjs/application"

// justjs#67: mount()/unmount() are the real teardown trigger DefaultRouter
// calls when navigating away from a route. This shell hosts a WebView (not
// separate native views per component), so there's no native resource to
// release per mount today - but the MountHandle contract is honored for
// real here rather than silently skipped, so a future capability that DOES
// need per-mount teardown (e.g. releasing a native camera preview surface)
// has a real hook to attach to instead of repeating justjs#67's gap.
export class JsRuntimeShellAdapter implements RuntimeAdapter {
  mount(_ddasId: string, _element: Element): MountHandle {
    return {
      unmount() {
        // No native view is constructed per mount in this shell today.
      },
    }
  }
}
