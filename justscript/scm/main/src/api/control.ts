export interface Disposable {
  dispose(): void
}

export class OneShotError extends Error {
  constructor() {
    super("OneShot: called more than once")
    this.name = "OneShotError"
  }
}
