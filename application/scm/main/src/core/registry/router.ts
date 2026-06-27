import type { Router } from "../../api/api_registry.js"
import { RegistryError } from "../../api/api_registry.js"

export class DefaultRouter implements Router {
  private currentRoute = "/"

  async navigate(path: string): Promise<void> {
    if (!path.startsWith("/")) {
      throw new RegistryError(`Route must start with /: ${path}`)
    }
    this.currentRoute = path
  }

  currentPath(): string {
    return this.currentRoute
  }
}
