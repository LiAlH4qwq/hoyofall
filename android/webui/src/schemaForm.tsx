import { useMemo, useState, type ReactNode } from "react"
import type { JSONSchema } from "effect"
import { metaFor, normalizePath, type FieldMeta } from "./fieldMeta"

type Json = JSONSchema.JsonSchema7
type Root = JSONSchema.JsonSchema7Root

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const omitKey = (
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key))

const humanize = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())

const labelOf = (path: ReadonlyArray<string>, meta: FieldMeta | undefined): string =>
  meta?.label ?? humanize(path[path.length - 1] ?? "value")

// Resolve `$ref` / single-element `allOf` (the shape Effect emits for bounded
// integers and named defs).
const resolve = (schema: Json, root: Root): Json => {
  if ("allOf" in schema && Array.isArray(schema.allOf) && schema.allOf.length === 1) {
    const only: unknown = schema.allOf[0]
    if (typeof only === "object" && only !== null && "$ref" in only) {
      return resolve(only as unknown as Json, root)
    }
  }
  if ("$ref" in schema) {
    const name = schema.$ref.replace("#/$defs/", "")
    const def = root.$defs?.[name]
    return def === undefined ? schema : resolve(def, root)
  }
  return schema
}

const numericBounds = (schema: Json): { min?: number; max?: number } => {
  const own: Record<string, unknown> = isPlainObject(schema) ? schema : {}
  const min = typeof own["minimum"] === "number" ? (own["minimum"] as number) : undefined
  const max = typeof own["maximum"] === "number" ? (own["maximum"] as number) : undefined
  const exclusive =
    typeof own["exclusiveMinimum"] === "number"
      ? (own["exclusiveMinimum"] as number) + 1
      : undefined
  return { min: min ?? exclusive, max }
}

type Kind =
  | { tag: "object"; properties: Record<string, Json>; required: ReadonlyArray<string> }
  | { tag: "record"; values: Json }
  | { tag: "array"; items: Json }
  | { tag: "enum"; values: ReadonlyArray<string | number | boolean> }
  | { tag: "boolean" }
  | { tag: "integer" }
  | { tag: "number" }
  | { tag: "string" }
  | { tag: "null" }
  | { tag: "union"; variants: ReadonlyArray<Json> }
  | { tag: "unknown" }

const kindOf = (schema: Json, root: Root): Kind => {
  const s = resolve(schema, root)
  if ("enum" in s && Array.isArray(s.enum)) {
    return { tag: "enum", values: s.enum }
  }
  if ("anyOf" in s && Array.isArray(s.anyOf)) {
    return { tag: "union", variants: s.anyOf as ReadonlyArray<Json> }
  }
  if ("patternProperties" in s && isPlainObject(s.patternProperties)) {
    const first: unknown = Object.values(s.patternProperties)[0]
    return { tag: "record", values: (first as Json | undefined) ?? { type: "string" } }
  }
  if ("type" in s) {
    switch (s.type) {
      case "object":
        return "properties" in s &&
          isPlainObject(s.properties) &&
          "required" in s &&
          Array.isArray(s.required)
          ? {
              tag: "object",
              properties: s.properties as Record<string, Json>,
              required: s.required,
            }
          : { tag: "unknown" }
      case "array": {
        const items: unknown =
          "items" in s && s.items !== undefined && s.items !== false && !Array.isArray(s.items)
            ? s.items
            : { type: "string" }
        return { tag: "array", items: items as Json }
      }
      case "boolean":
        return { tag: "boolean" }
      case "integer":
        return { tag: "integer" }
      case "number":
        return { tag: "number" }
      case "string":
        return { tag: "string" }
      case "null":
        return { tag: "null" }
      default:
        return { tag: "unknown" }
    }
  }
  return { tag: "unknown" }
}

const defaultFor = (schema: Json, root: Root): unknown => {
  const kind = kindOf(schema, root)
  switch (kind.tag) {
    case "boolean":
      return false
    case "integer":
    case "number":
      return numericBounds(resolve(schema, root)).min ?? 0
    case "string":
      return ""
    case "enum":
      return kind.values[0] ?? ""
    case "array":
      return []
    case "record":
      return {}
    case "object":
      return Object.fromEntries(
        kind.required
          .filter((key) => kind.properties[key] !== undefined)
          .map((key) => [key, defaultFor(kind.properties[key] as Json, root)]),
      )
    case "union": {
      const first = kind.variants.find((v) => kindOf(v, root).tag !== "null")
      return first === undefined ? null : defaultFor(first, root)
    }
    default:
      return ""
  }
}

const discriminatorOf = (variant: Json, root: Root): string | undefined => {
  const kind = kindOf(variant, root)
  if (kind.tag !== "object") {
    return undefined
  }
  const typeSchema = kind.properties["type"]
  if (typeSchema === undefined) {
    return undefined
  }
  const typeKind = kindOf(typeSchema, root)
  return typeKind.tag === "enum" && typeKind.values.length === 1
    ? String(typeKind.values[0])
    : undefined
}

type FieldProps = {
  readonly schema: Json
  readonly root: Root
  readonly value: unknown
  readonly path: ReadonlyArray<string>
  readonly required: boolean
  readonly onChange: (next: unknown) => void
}

const Label = ({
  path,
  meta,
  required,
}: {
  readonly path: ReadonlyArray<string>
  readonly meta: FieldMeta | undefined
  readonly required: boolean
}) => (
  <span className="label">
    {labelOf(path, meta)}
    {meta?.unit !== undefined ? ` (${meta.unit})` : ""}
    {required ? <span className="req"> *</span> : null}
  </span>
)

const ScalarField = ({ schema, root, value, path, required, onChange }: FieldProps) => {
  const kind = kindOf(schema, root)
  const meta = metaFor(path)

  if (kind.tag === "boolean") {
    return (
      <label className="field boolean">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <Label path={path} meta={meta} required={required} />
      </label>
    )
  }

  if (kind.tag === "enum") {
    return (
      <label className="field">
        <Label path={path} meta={meta} required={required} />
        <select
          value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
          onChange={(event) => {
            const raw = event.target.value
            if (raw === "") {
              onChange(undefined)
              return
            }
            const match = kind.values.find((entry) => String(entry) === raw)
            onChange(match)
          }}
        >
          {!required ? <option value="">—</option> : null}
          {kind.values.map((entry) => (
            <option key={String(entry)} value={String(entry)}>
              {String(entry)}
            </option>
          ))}
        </select>
        {meta?.help !== undefined ? <p className="hint">{meta.help}</p> : null}
      </label>
    )
  }

  if (kind.tag === "integer" || kind.tag === "number") {
    const bounds = numericBounds(resolve(schema, root))
    return (
      <label className="field">
        <Label path={path} meta={meta} required={required} />
        <input
          type="number"
          min={bounds.min}
          max={bounds.max}
          step={kind.tag === "integer" ? 1 : "any"}
          value={typeof value === "number" ? String(value) : ""}
          onChange={(event) => {
            const raw = event.target.value
            if (raw === "") {
              onChange(undefined)
              return
            }
            const parsed = kind.tag === "integer" ? Number.parseInt(raw, 10) : Number(raw)
            onChange(Number.isNaN(parsed) ? undefined : parsed)
          }}
        />
        {meta?.help !== undefined ? <p className="hint">{meta.help}</p> : null}
      </label>
    )
  }

  return (
    <label className="field">
      <Label path={path} meta={meta} required={required} />
      <input
        type="text"
        value={typeof value === "string" ? value : ""}
        onChange={(event) =>
          onChange(event.target.value === "" && !required ? undefined : event.target.value)
        }
      />
      {meta?.help !== undefined ? <p className="hint">{meta.help}</p> : null}
    </label>
  )
}

const ArrayField = ({ schema, root, value, path, required, onChange }: FieldProps) => {
  const kind = kindOf(schema, root)
  const items = kind.tag === "array" ? kind.items : ({ type: "string" } as Json)
  const list = Array.isArray(value) ? value : []
  const meta = metaFor(path)
  const itemMeta = metaFor([...path, "*"])

  return (
    <div className="field array">
      <Label path={path} meta={meta} required={required} />
      {list.map((entry, index) => (
        <div className="row" key={String(index)}>
          <Field
            schema={items}
            root={root}
            value={entry}
            path={[...path, String(index)]}
            required={false}
            onChange={(next) =>
              onChange(list.map((prev, i) => (i === index ? next : prev)))
            }
          />
          <button
            type="button"
            className="ghost small"
            onClick={() => onChange(list.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ghost small"
        onClick={() => onChange([...list, defaultFor(items, root)])}
      >
        + {itemMeta?.label ?? "Add"}
      </button>
    </div>
  )
}

const RecordField = ({ schema, root, value, path, onChange }: FieldProps) => {
  const kind = kindOf(schema, root)
  const values = kind.tag === "record" ? kind.values : ({ type: "string" } as Json)
  const record = isPlainObject(value) ? value : {}
  const meta = metaFor(path)

  const rename = (from: string, to: string): void => {
    if (to === "" || to === from || record[to] !== undefined) {
      return
    }
    onChange(
      Object.fromEntries(
        Object.entries(record).map(([key, entry]) => (key === from ? [to, entry] : [key, entry])),
      ),
    )
  }

  const add = (): void => {
    const name = window.prompt("Key")
    if (name === null || name === "" || record[name] !== undefined) {
      return
    }
    onChange({ ...record, [name]: defaultFor(values, root) })
  }

  return (
    <div className="field record">
      <div className="record-head">
        <Label path={path} meta={meta} required={false} />
        <button type="button" className="ghost small" onClick={add}>
          + Add
        </button>
      </div>
      {Object.entries(record).map(([key, entry]) => (
        <details className="entry" key={key} open>
          <summary>
            <input
              className="key"
              defaultValue={key}
              onBlur={(event) => rename(key, event.target.value)}
            />
            <button
              type="button"
              className="ghost small"
              onClick={() => onChange(omitKey(record, key))}
            >
              ×
            </button>
          </summary>
          <Field
            schema={values}
            root={root}
            value={entry}
            path={[...path, key]}
            required={false}
            onChange={(next) => onChange({ ...record, [key]: next })}
          />
        </details>
      ))}
    </div>
  )
}

const ObjectField = ({
  schema,
  root,
  value,
  path,
  required,
  onChange,
  omit = [],
  children,
}: FieldProps & {
  readonly omit?: ReadonlyArray<string>
  readonly children?: ReactNode
}) => {
  const kind = kindOf(schema, root)
  if (kind.tag !== "object") {
    return (
      <ScalarField
        schema={schema}
        root={root}
        value={value}
        path={path}
        required={required}
        onChange={onChange}
      />
    )
  }
  const obj = isPlainObject(value) ? value : {}
  const meta = metaFor(path)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const keys = Object.keys(kind.properties)
    .filter((key) => !omit.includes(key))
    .map((key) => ({ key, meta: metaFor([...path, key]) }))
    .map((entry, index) => ({ ...entry, index }))
    .sort(
      (a, b) =>
        (a.meta?.order ?? 1000) - (b.meta?.order ?? 1000) || a.index - b.index,
    )

  const hiddenAdvanced = keys.filter(
    ({ key, meta: fieldMeta }) =>
      fieldMeta?.advanced === true && obj[key] === undefined && !showAdvanced,
  )

  return (
    <div className={`field object depth-${path.length}`}>
      {path.length > 0 ? (
        <div className="object-head">
          <Label path={path} meta={meta} required={required} />
        </div>
      ) : null}
      {children}
      {keys.map(({ key, meta: fieldMeta }) => {
        if (
          fieldMeta?.advanced === true &&
          obj[key] === undefined &&
          !showAdvanced
        ) {
          return null
        }
        return (
          <Field
            key={key}
            schema={kind.properties[key] as Json}
            root={root}
            value={obj[key]}
            path={[...path, key]}
            required={kind.required.includes(key)}
            onChange={(next) => onChange({ ...obj, [key]: next })}
          />
        )
      })}
      {hiddenAdvanced.length > 0 ? (
        <button
          type="button"
          className="ghost small"
          onClick={() => setShowAdvanced(true)}
        >
          + Advanced ({hiddenAdvanced.length})
        </button>
      ) : null}
    </div>
  )
}

const SubscriptionField = (props: FieldProps) => {
  const { schema, root, value, path, onChange } = props
  const obj = isPlainObject(value) ? value : {}
  const usesEnv = typeof obj.urlEnv === "string" && obj.url === undefined
  const mode: "url" | "urlEnv" = usesEnv ? "urlEnv" : "url"
  const kind = kindOf(schema, root)
  const urlSchema = kind.tag === "object" ? kind.properties["url"] : undefined
  const urlEnvSchema = kind.tag === "object" ? kind.properties["urlEnv"] : undefined

  return (
    <ObjectField {...props} omit={["url", "urlEnv"]}>
      <div className="field url-mode">
        <span className="label">Source</span>
        <div className="segmented">
          <button
            type="button"
            className={mode === "url" ? "active" : ""}
            onClick={() => onChange(omitKey(obj, "urlEnv"))}
          >
            URL
          </button>
          <button
            type="button"
            className={mode === "urlEnv" ? "active" : ""}
            onClick={() =>
              onChange({ ...omitKey(obj, "url"), urlEnv: "" })
            }
          >
            Env var
          </button>
        </div>
        {mode === "url" && urlSchema !== undefined ? (
          <Field
            schema={urlSchema}
            root={root}
            value={obj.url}
            path={[...path, "url"]}
            required
            onChange={(next) => onChange({ ...omitKey(obj, "urlEnv"), url: next })}
          />
        ) : null}
        {mode === "urlEnv" && urlEnvSchema !== undefined ? (
          <Field
            schema={urlEnvSchema}
            root={root}
            value={obj.urlEnv}
            path={[...path, "urlEnv"]}
            required
            onChange={(next) => onChange({ ...omitKey(obj, "url"), urlEnv: next })}
          />
        ) : null}
      </div>
    </ObjectField>
  )
}

const UnionField = (props: FieldProps) => {
  const { schema, root, value, path, required, onChange } = props
  const kind = kindOf(schema, root)
  if (kind.tag !== "union") {
    return <ScalarField {...props} />
  }
  const hasNull = kind.variants.some((v) => kindOf(v, root).tag === "null")
  const nonNull = kind.variants.filter((v) => kindOf(v, root).tag !== "null")
  const discriminators = kind.variants.map((v) => discriminatorOf(v, root))

  if (discriminators.every((d) => d !== undefined)) {
    const obj = isPlainObject(value) ? value : {}
    const current = typeof obj.type === "string" ? obj.type : String(discriminators[0])
    const index = discriminators.findIndex((d) => d === current)
    const variant = kind.variants[index] ?? kind.variants[0]

    return (
      <div className="field union">
        <label className="field">
          <span className="label">Kind</span>
          <select
            value={current}
            onChange={(event) =>
              onChange(
                defaultFor(
                  variantWithType(kind.variants, discriminators, event.target.value),
                  root,
                ),
              )
            }
          >
            {discriminators.map((discriminator) => (
              <option key={String(discriminator)} value={String(discriminator)}>
                {String(discriminator)}
              </option>
            ))}
          </select>
        </label>
        {variant !== undefined ? (
          <ObjectField
            schema={variant}
            root={root}
            value={{ ...obj, type: current }}
            path={path}
            required={required}
            onChange={(next) => onChange(next)}
            omit={["type"]}
          />
        ) : null}
      </div>
    )
  }

  const first = nonNull[0] ?? kind.variants[0]
  if (first === undefined) {
    return null
  }
  return (
    <div className="field union">
      {hasNull && value !== undefined && value !== null ? (
        <button type="button" className="ghost small" onClick={() => onChange(undefined)}>
          Clear
        </button>
      ) : null}
      <Field
        schema={first}
        root={root}
        value={value}
        path={path}
        required={required && !hasNull}
        onChange={onChange}
      />
    </div>
  )
}

const variantWithType = (
  variants: ReadonlyArray<Json>,
  discriminators: ReadonlyArray<string | undefined>,
  type: string,
): Json => {
  const index = discriminators.findIndex((d) => d === type)
  return variants[index] ?? variants[0] ?? { type: "string" }
}

const Field = ({
  schema,
  root,
  value,
  path,
  required,
  onChange,
}: FieldProps): ReactNode => {
  const kind = kindOf(schema, root)
  switch (kind.tag) {
    case "object":
      return normalizePath(path) === "subscriptions.*" ? (
        <SubscriptionField
          schema={schema}
          root={root}
          value={value}
          path={path}
          required={required}
          onChange={onChange}
        />
      ) : (
        <ObjectField
          schema={schema}
          root={root}
          value={value}
          path={path}
          required={required}
          onChange={onChange}
        />
      )
    case "record":
      return (
        <RecordField
          schema={schema}
          root={root}
          value={value}
          path={path}
          required={required}
          onChange={onChange}
        />
      )
    case "array":
      return (
        <ArrayField
          schema={schema}
          root={root}
          value={value}
          path={path}
          required={required}
          onChange={onChange}
        />
      )
    case "union":
      return (
        <UnionField
          schema={schema}
          root={root}
          value={value}
          path={path}
          required={required}
          onChange={onChange}
        />
      )
    default:
      return (
        <ScalarField
          schema={schema}
          root={root}
          value={value}
          path={path}
          required={required}
          onChange={onChange}
        />
      )
  }
}

export const SchemaForm = ({
  schema,
  value,
  onChange,
}: {
  readonly schema: Root
  readonly value: unknown
  readonly onChange: (next: unknown) => void
}) => {
  const memo = useMemo(() => schema, [schema])
  return (
    <div className="schema-form">
      <Field
        schema={memo}
        root={memo}
        value={value}
        path={[]}
        required
        onChange={onChange}
      />
    </div>
  )
}
