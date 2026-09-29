// Human-facing labels and help for the configuration schema-form. The JSON
// Schema has no titles, so this map is the one hand-maintained piece; paths use
// dot notation with `*` standing for a record key (e.g. `subscriptions.*.url`).

export type FieldMeta = {
  readonly label: string
  readonly help?: string
  readonly unit?: string
  // Hidden behind "Advanced" unless the value is already present.
  readonly advanced?: boolean
  // Render order among siblings (lower first); unset fields keep schema order.
  readonly order?: number
}

// Normalise a concrete path into its meta key: record values (custom groups,
// subscriptions) collapse to `*`.
const RECORD_SEGMENTS = new Set(["custom", "subscriptions"])

export const normalizePath = (path: ReadonlyArray<string>): string =>
  path
    .map((segment, index) =>
      index > 0 && RECORD_SEGMENTS.has(path[index - 1] ?? "") ? "*" : segment,
    )
    .join(".")

export const metaFor = (path: ReadonlyArray<string>): FieldMeta | undefined =>
  FIELD_META[normalizePath(path)]

const CUSTOM_GROUP: Record<string, FieldMeta> = {
  level: {
    label: "Level",
    help: "Order within this scope; referenced groups must be strictly lower.",
    order: 1,
  },
  type: { label: "Type", order: 2 },
  includeProxies: { label: "Include proxies", order: 3 },
  includeNativeGroups: { label: "Include native groups", order: 4 },
  includeRegexes: { label: "Include names (regex)", order: 5 },
  excludeRegexes: { label: "Exclude names (regex)", order: 6 },
  includeSubRegexes: {
    label: "Include subscriptions (regex)",
    help: "Instance-level groups only.",
    order: 7,
  },
  excludeSubRegexes: {
    label: "Exclude subscriptions (regex)",
    help: "Instance-level groups only.",
    order: 8,
  },
  includeLevels: { label: "Include levels", order: 9 },
  members: { label: "Members", order: 10 },
  onEmpty: { label: "On empty", order: 11 },
  default: { label: "Default member", order: 12 },
  includeDirect: { label: "Append direct", order: 13 },
  includeBlock: { label: "Append block", order: 14 },
  interruptExistConnections: {
    label: "Interrupt existing connections",
    order: 15,
  },
  url: { label: "Probe URL", order: 16 },
  intervalSeconds: { label: "Interval", unit: "s", order: 17 },
  tolerance: { label: "Tolerance", unit: "ms", order: 18 },
  idleTimeoutSeconds: { label: "Idle timeout", unit: "s", order: 19 },
}

export const FIELD_META: Record<string, FieldMeta> = {
  groups: { label: "Groups", order: 1 },
  "groups.custom": { label: "Custom groups", order: 1 },
  "groups.custom.*": { label: "Custom group" },
  ...Object.fromEntries(
    Object.entries(CUSTOM_GROUP).map(([key, meta]) => [
      `groups.custom.*.${key}`,
      meta,
    ]),
  ),

  subscriptions: { label: "Subscriptions", order: 2 },
  "subscriptions.*": { label: "Subscription" },
  "subscriptions.*.name": { label: "Name", order: 1 },
  "subscriptions.*.url": {
    label: "URL",
    help: "Exactly one of URL or URL env var is required.",
    order: 2,
  },
  "subscriptions.*.urlEnv": {
    label: "URL env var",
    help: "Name of an environment variable holding the URL.",
    order: 3,
  },
  "subscriptions.*.intervalSeconds": {
    label: "Refresh interval",
    unit: "s",
    order: 4,
  },
  "subscriptions.*.userAgent": { label: "User-Agent", order: 5 },
  "subscriptions.*.format": { label: "Format", order: 6 },
  "subscriptions.*.onUnsupported": { label: "On unsupported", order: 7 },
  "subscriptions.*.convert": { label: "Convert", order: 8 },
  "subscriptions.*.convert.exclude": { label: "Exclude (regex)" },
  "subscriptions.*.groups": { label: "Groups", order: 9, advanced: true },
  "subscriptions.*.groups.native": { label: "Native groups" },
  "subscriptions.*.groups.native.enable": { label: "Enable" },
  "subscriptions.*.groups.native.includeRegexes": {
    label: "Include names (regex)",
  },
  "subscriptions.*.groups.native.excludeRegexes": {
    label: "Exclude names (regex)",
  },
  "subscriptions.*.groups.native.fallback": {
    label: "Fallback groups",
    help: "Mapping for mihomo fallback groups.",
  },
  "subscriptions.*.groups.native.loadBalance": {
    label: "Load-balance groups",
    help: "Mapping for mihomo load-balance groups.",
  },
  "subscriptions.*.groups.custom": { label: "Custom groups" },
  "subscriptions.*.groups.custom.*": { label: "Custom group" },
  ...Object.fromEntries(
    Object.entries(CUSTOM_GROUP).map(([key, meta]) => [
      `subscriptions.*.groups.custom.*.${key}`,
      meta,
    ]),
  ),
  "subscriptions.*.groups.custom.*.includeSubRegexes": {
    ...(CUSTOM_GROUP.includeSubRegexes as FieldMeta),
    advanced: true,
  },
  "subscriptions.*.groups.custom.*.excludeSubRegexes": {
    ...(CUSTOM_GROUP.excludeSubRegexes as FieldMeta),
    advanced: true,
  },

  convert: { label: "Convert", order: 3 },
  "convert.emitBuiltinOutbounds": {
    label: "Emit built-in outbounds",
    help: "Emit direct/block. Leave off when the base config defines them.",
  },
  "convert.proxyNameFormat": {
    label: "Proxy name format",
    help: "{sub} = subscription name, {name} = original name.",
  },

  output: { label: "Output", order: 4 },
  "output.file": { label: "File output", order: 1 },
  "output.file.enabled": { label: "Enabled" },
  "output.file.mode": { label: "Mode" },
  "output.file.path": { label: "Path", help: "Used by aggregate / both." },
  "output.file.directory": {
    label: "Directory",
    help: "Used by per-subscription / both.",
  },
  "output.file.permissions": { label: "Permissions" },
  "output.file.pretty": { label: "Pretty-print" },
  "output.http": { label: "HTTP output", order: 2 },
  "output.http.enabled": { label: "Enabled" },
  "output.http.listen": { label: "Listen" },
  "output.http.listen.host": { label: "Host" },
  "output.http.listen.port": { label: "Port" },
}
