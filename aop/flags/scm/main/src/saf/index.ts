export type { UIFlagsContext, FlagsProviderConfig, FlagsAspect, FlagsProvider } from "../api/provider.js"
export { NoopFlagsContext } from "../api/provider.js"

import type { FlagsProvider } from "../api/provider.js"
import { DefaultFlagsProvider } from "../core/default_flags.js"

// Factory, not a direct class re-export (core_not_exported_directly,
// scm/config/arch/policy/rules/interface.toml) - callers depend on the
// FlagsProvider contract, never the concrete Default* class name.
export function createFlagsProvider(): FlagsProvider {
  return new DefaultFlagsProvider()
}
