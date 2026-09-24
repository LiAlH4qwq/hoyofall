import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import * as ts from "typescript"

interface Violation {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly rule: string
  readonly snippet: string
}

const roots = ["src", "test", "scripts"]

const collectTypeScriptFiles = (directory: string): ReadonlyArray<string> =>
  readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry)
    return statSync(full).isDirectory()
      ? collectTypeScriptFiles(full)
      : full.endsWith(".ts")
        ? [full]
        : []
  })

const prohibitedMethods = new Set([
  "forEach",
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
])

const prohibitedStatics = new Set([
  "Object.assign",
  "Object.defineProperty",
  "Object.defineProperties",
  "Object.setPrototypeOf",
  "Reflect.set",
  "Reflect.deleteProperty",
  "Reflect.defineProperty",
  "Reflect.setPrototypeOf",
])

const location = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
): { readonly line: number; readonly column: number } => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  )
  return { line: line + 1, column: character + 1 }
}

const violation = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
  rule: string,
): Violation => ({
  file: sourceFile.fileName,
  ...location(sourceFile, node),
  rule,
  snippet: node.getText(sourceFile).replace(/\s+/g, " ").slice(0, 100),
})

const ruleFor = (sourceFile: ts.SourceFile, node: ts.Node): string | undefined => {
  switch (node.kind) {
    case ts.SyntaxKind.VariableDeclarationList:
      return ((node as ts.VariableDeclarationList).flags & ts.NodeFlags.Const) !== 0
        ? undefined
        : "no var / let / using declarations"
    case ts.SyntaxKind.WhileStatement:
    case ts.SyntaxKind.DoStatement:
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement:
    case ts.SyntaxKind.LabeledStatement:
      return "no loop / label statements"
    case ts.SyntaxKind.BreakStatement:
    case ts.SyntaxKind.ContinueStatement:
      return "no break / continue statements"
    case ts.SyntaxKind.TryStatement:
      return "no try / catch statements"
    case ts.SyntaxKind.ThrowStatement:
      return "no throw statements"
    case ts.SyntaxKind.AsyncKeyword:
      return "no async functions; use Effect.gen / Effect.fn"
    case ts.SyntaxKind.AwaitExpression:
      return "no await; use Effect.gen + yield*"
    case ts.SyntaxKind.PrefixUnaryExpression:
    case ts.SyntaxKind.PostfixUnaryExpression: {
      const unary = node as ts.PrefixUnaryExpression | ts.PostfixUnaryExpression
      return unary.operator === ts.SyntaxKind.PlusPlusToken ||
        unary.operator === ts.SyntaxKind.MinusMinusToken
        ? "no ++ / -- update expressions"
        : undefined
    }
    case ts.SyntaxKind.DeleteExpression:
      return "no delete expressions"
    case ts.SyntaxKind.AnyKeyword:
      return "no `any`; it bypasses the type system"
    case ts.SyntaxKind.AsExpression:
      return (node as ts.AsExpression).expression.kind ===
        ts.SyntaxKind.AsExpression
        ? "no `as unknown as` double type assertions"
        : undefined
    case ts.SyntaxKind.BinaryExpression: {
      const binary = node as ts.BinaryExpression
      return binary.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        (ts.isPropertyAccessExpression(binary.left) ||
          ts.isElementAccessExpression(binary.left))
        ? "no mutation of object / array members"
        : undefined
    }
    case ts.SyntaxKind.CallExpression: {
      const call = node as ts.CallExpression
      const callee = call.expression
      if (!ts.isPropertyAccessExpression(callee)) {
        return undefined
      }
      const receiver = callee.expression.getText(sourceFile)
      const name = callee.name.text
      if (name === "then" || name === "finally") {
        return `no Promise.${name}(); convert the Promise to Effect at the boundary`
      }
      if (prohibitedMethods.has(name)) {
        return `no .${name}() (use map / filter / reduce / flatMap / Effect.all)`
      }
      return prohibitedStatics.has(`${receiver}.${name}`)
        ? `no ${receiver}.${name}() mutation`
        : undefined
    }
    default:
      return undefined
  }
}

const visit = (
  sourceFile: ts.SourceFile,
  node: ts.Node,
): ReadonlyArray<Violation> => {
  const current = ruleFor(sourceFile, node)
  const children = node
    .getChildren(sourceFile)
    .flatMap((child) => visit(sourceFile, child))
  return current === undefined
    ? children
    : [violation(sourceFile, node, current), ...children]
}

const checkFile = (file: string): ReadonlyArray<Violation> => {
  const source = readFileSync(file, "utf8")
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  return visit(sourceFile, sourceFile)
}

const violations = roots.flatMap((root) =>
  collectTypeScriptFiles(root).flatMap(checkFile),
)

if (violations.length > 0) {
  const report = violations
    .map(
      (item) =>
        `${item.file}:${item.line}:${item.column}  ${item.rule}\n    ${item.snippet}`,
    )
    .join("\n")
  process.stderr.write(
    `check-ast: found ${violations.length} forbidden imperative construct(s):\n${report}\n`,
  )
  process.exit(1)
}

process.stdout.write("check-ast: no forbidden imperative constructs\n")
