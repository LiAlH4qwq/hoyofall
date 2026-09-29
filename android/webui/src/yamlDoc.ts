import { isMap, parseDocument, type Node } from "yaml"

type ConfigDocument = ReturnType<typeof parseDocument>

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const scalarValue = (key: unknown): string =>
  isPlainObject(key) && "value" in key ? String(key.value) : String(key)

const mapKeys = (node: unknown): ReadonlyArray<string> =>
  isMap(node) ? node.items.map((pair) => scalarValue(pair.key)) : []

// Copy the leading/trailing comment trivia from an old node onto its
// replacement so editing a scalar does not drop its comment.
const copyTrivia = (from: unknown, to: Node): void => {
  if (!isPlainObject(from)) {
    return
  }
  const target = to as unknown as Record<string, unknown>
  const props = ["commentBefore", "comment", "spaceBefore"] as const
  props.forEach((prop) => {
    if (from[prop] !== undefined) {
      target[prop] = from[prop]
    }
  })
}

const setAt = (
  doc: ConfigDocument,
  path: ReadonlyArray<string>,
  node: Node,
): void => {
  if (path.length === 0) {
    doc.contents = node
    return
  }
  doc.setIn([...path], node)
}

// Reconcile a plain JS value onto the document in place: objects/records keep
// their comments (only changed scalars are replaced), arrays are replaced
// wholesale. Keys missing from `value` are removed.
const sync = (
  doc: ConfigDocument,
  path: ReadonlyArray<string>,
  value: unknown,
): void => {
  if (isPlainObject(value)) {
    const node: unknown = doc.getIn([...path], true)
    if (!isMap(node)) {
      setAt(doc, path, doc.createNode(value))
      return
    }
    mapKeys(node)
      .filter((key) => !(key in value))
      .forEach((key) => doc.deleteIn([...path, key]))
    Object.entries(value).forEach(([key, entry]) =>
      sync(doc, [...path, key], entry),
    )
    return
  }
  if (Array.isArray(value)) {
    setAt(doc, path, doc.createNode(value))
    return
  }
  const existing: unknown = doc.getIn([...path], true)
  const next = doc.createNode(value ?? null)
  copyTrivia(existing, next)
  setAt(doc, path, next)
}

// Apply a form value to YAML text, preserving comments where possible.
export const applyValue = (text: string, value: unknown): string => {
  const doc = parseDocument(text)
  sync(doc, [], value)
  return doc.toString()
}

export const parseDocumentText = (text: string): ConfigDocument =>
  parseDocument(text)
