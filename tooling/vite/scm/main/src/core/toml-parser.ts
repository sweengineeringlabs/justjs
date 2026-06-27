export interface ParsedToml {
  readonly [key: string]: unknown
}

export function parseToml(content: string): ParsedToml {
  const result: Record<string, unknown> = {}
  const lines = content.split("\n")
  let currentSection: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim()

    if (!line || line.startsWith("#")) continue

    if (line.startsWith("[") && line.endsWith("]")) {
      currentSection = line.slice(1, -1).trim()
      result[currentSection] = {}
      continue
    }

    if (line.includes("=")) {
      const parts = line.split("=")
      const keyPart = parts[0]?.trim()
      const valuePart = parts[1]?.trim()

      if (!keyPart || !valuePart) continue

      const parsedValue = parseValue(valuePart)

      if (currentSection) {
        const section = result[currentSection]
        if (section && typeof section === "object" && !Array.isArray(section)) {
          ;(section as Record<string, unknown>)[keyPart] = parsedValue
        }
      } else {
        result[keyPart] = parsedValue
      }
    }
  }

  return result
}

function parseValue(value: string): unknown {
  if (value === "true") return true
  if (value === "false") return false

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1)
  }

  if (value.startsWith("[") && value.endsWith("]")) {
    const items = value
      .slice(1, -1)
      .split(",")
      .map((item) => {
        const trimmed = item.trim()
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1)
        }
        return trimmed
      })
    return items
  }

  if (!isNaN(Number(value))) {
    return Number(value)
  }

  return value
}
