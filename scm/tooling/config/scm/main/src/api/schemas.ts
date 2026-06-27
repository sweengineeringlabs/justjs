export interface JsonSchema {
  $schema?: string
  title?: string
  description?: string
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  additionalProperties?: boolean | JsonSchema
  items?: JsonSchema
  enum?: unknown[]
  default?: unknown
  examples?: unknown[]
  minLength?: number
  maxLength?: number
  pattern?: string
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
}

export interface SchemaDefinition {
  name: string
  schema: JsonSchema
}

export interface SchemaRegistry {
  register(definition: SchemaDefinition): void
  get(name: string): JsonSchema | undefined
  list(): SchemaDefinition[]
  validate(data: unknown, schemaName: string): ValidationResult
}

export interface ValidationResult {
  valid: boolean
  errors?: ValidationError[]
}

export interface ValidationError {
  path: string
  message: string
}
