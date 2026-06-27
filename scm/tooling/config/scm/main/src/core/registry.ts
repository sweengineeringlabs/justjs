import type { JsonSchema, SchemaDefinition, SchemaRegistry, ValidationResult, ValidationError } from "../api/schemas.js"
import { BUILTIN_SCHEMAS } from "./builtin_schemas.js"

export class DefaultSchemaRegistry implements SchemaRegistry {
  private schemas: Map<string, JsonSchema> = new Map()

  constructor() {
    BUILTIN_SCHEMAS.forEach((def) => {
      this.schemas.set(def.name, def.schema)
    })
  }

  register(definition: SchemaDefinition): void {
    this.schemas.set(definition.name, definition.schema)
  }

  get(name: string): JsonSchema | undefined {
    return this.schemas.get(name)
  }

  list(): SchemaDefinition[] {
    return Array.from(this.schemas.entries()).map(([name, schema]) => ({
      name,
      schema,
    }))
  }

  validate(data: unknown, schemaName: string): ValidationResult {
    const schema = this.get(schemaName)
    if (!schema) {
      return {
        valid: false,
        errors: [{ path: "", message: `Schema "${schemaName}" not found` }],
      }
    }

    const errors = this.validateData(data, schema, "")

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  private validateData(data: unknown, schema: JsonSchema, path: string): ValidationError[] {
    const errors: ValidationError[] = []

    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type]
      const dataType = Array.isArray(data) ? "array" : typeof data
      if (!types.includes(dataType)) {
        errors.push({
          path,
          message: `Expected type ${types.join("|")}, got ${dataType}`,
        })
        return errors
      }
    }

    if (schema.required && typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>
      schema.required.forEach((key) => {
        if (!(key in obj)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            message: `Required property missing`,
          })
        }
      })
    }

    if (schema.properties && typeof data === "object" && data !== null) {
      const obj = data as Record<string, unknown>
      Object.entries(schema.properties).forEach(([key, propSchema]) => {
        if (key in obj) {
          const propPath = path ? `${path}.${key}` : key
          errors.push(...this.validateData(obj[key], propSchema, propPath))
        }
      })
    }

    if (schema.enum && !schema.enum.includes(data)) {
      errors.push({
        path,
        message: `Must be one of: ${schema.enum.join(", ")}`,
      })
    }

    if (typeof data === "string") {
      if (schema.minLength !== undefined && data.length < schema.minLength) {
        errors.push({
          path,
          message: `String too short, minimum length ${schema.minLength}`,
        })
      }
      if (schema.maxLength !== undefined && data.length > schema.maxLength) {
        errors.push({
          path,
          message: `String too long, maximum length ${schema.maxLength}`,
        })
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
        errors.push({
          path,
          message: `Does not match pattern ${schema.pattern}`,
        })
      }
    }

    if (typeof data === "number") {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push({
          path,
          message: `Number below minimum ${schema.minimum}`,
        })
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push({
          path,
          message: `Number above maximum ${schema.maximum}`,
        })
      }
    }

    return errors
  }
}
