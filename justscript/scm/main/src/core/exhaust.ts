export function exhaust(value: never): never {
  throw new Error(`Unhandled variant: ${String(value)}`)
}
