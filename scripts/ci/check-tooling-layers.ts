import { existsSync, readFileSync } from "node:fs"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"
import ts from "typescript"

type Layer = "core" | "spi" | "api"
interface Policy { core: string[]; spi: string[]; api: string[] }
interface Workspace { root: string; name: string; policy: Policy; options: ts.CompilerOptions }
interface Edge { specifier: string; typeOnly: boolean }

const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"))
const within = (file: string, directory: string) => {
  const path = relative(directory, file)
  return !isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`)
}

/** Package.json layer constraints for the tooling/archive scope of #156. */
export function checkToolingLayers(root: string): string[] {
  const errors = new Set<string>()
  const workspaces: Workspace[] = []
  const sources = new Map<string, { workspace: Workspace; layer: Layer }>()
  for (const path of readJson(resolve(root, "package.json")).workspaces as string[]) {
    const directory = resolve(root, path)
    const manifest = readJson(resolve(directory, "package.json"))
    const policy = manifest.justjsLayers as Policy | undefined
    if (!policy) {
      if (path.startsWith("tooling/") || path === "cloud-connect/scm/main") errors.add(`${path}: missing justjsLayers package constraints`)
      continue
    }
    const config = ts.readConfigFile(resolve(directory, "tsconfig.json"), ts.sys.readFile)
    const options = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, directory).options
    const workspace = { root: directory, name: manifest.name as string, policy, options }
    workspaces.push(workspace)
    for (const layer of ["core", "spi", "api"] as const) {
      if (!Array.isArray(policy[layer])) { errors.add(`${path}: missing ${layer} constraints`); continue }
      for (const pattern of policy[layer]) {
        for (const file of new Bun.Glob(pattern).scanSync({ cwd: directory, onlyFiles: true })) {
          sources.set(resolve(directory, file), { workspace, layer })
        }
      }
    }
    // A nested core package cannot acquire even an unused external dependency.
    const coreDirectories = new Set(policy.core.map((pattern) => resolve(directory, pattern.split("*")[0]!.replace(/[^/]+\.ts$/, ""))))
    for (const directory of coreDirectories) {
      if (!existsSync(directory)) continue
      for (const file of new Bun.Glob("**/package.json").scanSync({ cwd: directory, onlyFiles: true })) {
        const manifest = readJson(resolve(directory, file))
        for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
          if (Object.keys(manifest[field] ?? {}).length) errors.add(`${relative(root, resolve(directory, file))}: core must declare zero external dependencies (${field})`)
        }
      }
    }
  }

  function resolveSource(specifier: string, importer: string, workspace: Workspace): string | undefined {
    // Account for workspace package exports pointing at built dist output.
    const targetPackage = workspaces.find((entry) => specifier === entry.name)
    if (targetPackage) return resolve(targetPackage.root, "src/saf/index.ts")
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(importer), specifier)
      for (const candidate of [target.replace(/\.js$/, ".ts"), `${target}.ts`, resolve(target, "index.ts"), target]) {
        if (existsSync(candidate) && /\.(?:[cm]?ts|[cm]?js|tsx|jsx)$/.test(candidate)) return candidate
      }
    }
    const resolved = ts.resolveModuleName(specifier, importer, workspace.options, ts.sys).resolvedModule?.resolvedFileName
    // TypeScript uses forward slashes on Windows; match the native paths in sources.
    return resolved ? resolve(resolved) : undefined
  }

  const cache = new Map<string, { edges: Edge[]; opaque: boolean; bun: boolean }>()
  function inspect(file: string) {
    const cached = cache.get(file)
    if (cached) return cached
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
    const result = { edges: [] as Edge[], opaque: false, bun: false }
    function visit(node: ts.Node): void {
      if (ts.isIdentifier(node) && node.text === "Bun") result.bun = true
      if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "Bun") result.bun = true
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
          const typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly === true : node.isTypeOnly
          result.edges.push({ specifier: node.moduleSpecifier.text, typeOnly })
        }
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const value = node.moduleReference.expression
        if (value && ts.isStringLiteralLike(value)) result.edges.push({ specifier: value.text, typeOnly: node.isTypeOnly })
        else result.opaque = true
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)) {
        result.edges.push({ specifier: node.argument.literal.text, typeOnly: true })
      } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
        const value = node.arguments[0]
        if (value && ts.isStringLiteralLike(value)) result.edges.push({ specifier: value.text, typeOnly: false })
        else result.opaque = true
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
    cache.set(file, result)
    return result
  }

  for (const [origin, { workspace, layer }] of sources) {
    if (layer === "api") continue
    const visited = new Set<string>()
    function walk(file: string): void {
      if (visited.has(file) || !existsSync(file)) return
      visited.add(file)
      const { edges, opaque, bun } = inspect(file)
      const label = `${relative(root, origin)}${file === origin ? "" : ` via ${relative(root, file)}`}`
      if (opaque) errors.add(`${label}: computed imports/require cannot satisfy ${layer} dependency constraints`)
      if (layer === "core" && bun) errors.add(`${label}: core must not reference the Bun runtime`)
      for (const edge of edges) {
        const target = resolveSource(edge.specifier, file, workspace)
        const targetLayer = target ? sources.get(target)?.layer : undefined
        if (layer === "core") {
          // Type-only contract imports can describe another workspace without
          // adding a runtime dependency. Implementation imports cannot.
          if (sources.get(file)?.layer === "api" && edge.typeOnly && !edge.specifier.startsWith(".")) continue
          if (!edge.specifier.startsWith(".") || !target || !within(target, workspace.root) || !["core", "api"].includes(targetLayer ?? "")) {
            errors.add(`${label}: core may import only its own api/core; forbidden '${edge.specifier}'`)
            continue
          }
        } else if (targetLayer === "core") {
          errors.add(`${label}: spi must not depend on core ('${edge.specifier}')`)
          continue
        }
        // Inspect local intermediaries too, so a SAF re-export cannot hide a
        // core <-> SPI dependency. Unrelated workspace providers stay out of scope.
        if (target && workspaces.some((entry) => within(target, resolve(entry.root, "src"))) && !target.endsWith(".d.ts")) walk(target)
      }
    }
    walk(origin)
  }
  return [...errors].sort()
}

if (import.meta.main) {
  const root = process.argv[2] ? resolve(process.argv[2]) : resolve(import.meta.dir, "../..")
  const errors = checkToolingLayers(root)
  if (errors.length) {
    console.error(errors.join("\n"))
    process.exitCode = 1
  } else console.log("Tooling/archive core and SPI dependency constraints passed.")
}
