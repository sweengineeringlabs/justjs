export interface FlagsContext {
  isEnabled(flag: string): boolean
  variant<T>(flag: string): T | null
}
