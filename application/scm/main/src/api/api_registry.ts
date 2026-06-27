import type { Component, ComponentProps } from "./component.js"

export type ComponentRegistry = Record<
  string,
  (props?: ComponentProps) => Component | Promise<Component>
>

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
