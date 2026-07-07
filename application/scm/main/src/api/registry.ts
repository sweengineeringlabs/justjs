export interface Router {
  navigate(path: string): Promise<void>
  currentPath(): string
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RegistryError"
  }
}
