import { Schema } from "effect"

export const ProxyNameFormatDefault = "{sub}-{name}"

export const GroupType = Schema.Literal("selector", "urltest")
export type GroupType = typeof GroupType.Type

export const CustomGroup = Schema.Struct({
  type: Schema.optionalWith(GroupType, { default: () => "selector" as const }),
  includeProxies: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  includeNativeGroups: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  includeCustomGroups: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  includeRegex: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
  excludeRegex: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
  members: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
  includeDirect: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  includeBlock: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  onEmpty: Schema.optionalWith(Schema.Literal("skip", "fail"), {
    default: () => "skip" as const,
  }),
  default: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null,
  }),
  interruptExistConnections: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  url: Schema.optionalWith(Schema.String, {
    default: () => "http://www.gstatic.com/generate_204",
  }),
  intervalSeconds: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThan(0)),
    { default: () => 300 },
  ),
  tolerance: Schema.optionalWith(Schema.Int, { default: () => 50 }),
  idleTimeoutSeconds: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThan(0)),
    { default: () => 1800 },
  ),
})
export type CustomGroup = typeof CustomGroup.Type

export const CustomGroups = Schema.Record({
  key: Schema.NonEmptyString,
  value: CustomGroup,
})
export type CustomGroups = typeof CustomGroups.Type

export const NativeGroupOptions = Schema.Struct({
  enable: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  includeRegex: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
  excludeRegex: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
  fallback: Schema.optionalWith(Schema.Literal("urltest", "skip"), {
    default: () => "urltest" as const,
  }),
  loadBalance: Schema.optionalWith(
    Schema.Literal("selector", "urltest", "skip"),
    { default: () => "selector" as const },
  ),
})
export type NativeGroupOptions = typeof NativeGroupOptions.Type

export const defaultNativeGroupOptions: NativeGroupOptions = {
  enable: false,
  includeRegex: [],
  excludeRegex: [],
  fallback: "urltest",
  loadBalance: "selector",
}

export const SubscriptionGroups = Schema.Struct({
  native: Schema.optionalWith(NativeGroupOptions, {
    default: () => defaultNativeGroupOptions,
  }),
  custom: Schema.optionalWith(CustomGroups, {
    default: () => ({}) as CustomGroups,
  }),
})
export type SubscriptionGroups = typeof SubscriptionGroups.Type

export const defaultSubscriptionGroups: SubscriptionGroups = {
  native: defaultNativeGroupOptions,
  custom: {},
}

export const SubscriptionConvert = Schema.Struct({
  exclude: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
})
export type SubscriptionConvert = typeof SubscriptionConvert.Type

const SubscriptionCommon = Schema.Struct({
  name: Schema.optional(Schema.NonEmptyString),
  intervalSeconds: Schema.optionalWith(
    Schema.Int.pipe(Schema.greaterThan(0)),
    { default: () => 3600 },
  ),
  userAgent: Schema.optional(Schema.String),
  format: Schema.optionalWith(
    Schema.Literal("auto", "clash", "base64"),
    { default: () => "auto" as const },
  ),
  onUnsupported: Schema.optionalWith(Schema.Literal("skip", "fail"), {
    default: () => "skip" as const,
  }),
  convert: Schema.optionalWith(SubscriptionConvert, {
    default: () => ({ exclude: [] as ReadonlyArray<string> }),
  }),
  groups: Schema.optionalWith(SubscriptionGroups, {
    default: () => defaultSubscriptionGroups,
  }),
})

export const Subscription = Schema.Union(
  Schema.extend(SubscriptionCommon, Schema.Struct({ url: Schema.NonEmptyString })),
  Schema.extend(SubscriptionCommon, Schema.Struct({ urlEnv: Schema.NonEmptyString })),
)
export type Subscription = typeof Subscription.Type

export const Subscriptions = Schema.Record({
  key: Schema.NonEmptyString,
  value: Subscription,
}).pipe(
  Schema.filter(
    (subscriptions) => Object.keys(subscriptions).length > 0,
    {
      message: () => "must contain at least one subscription",
      jsonSchema: { minProperties: 1 },
    },
  ),
)
export type Subscriptions = typeof Subscriptions.Type

export const ConvertOptions = Schema.Struct({
  emitBuiltinOutbounds: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  proxyNameFormat: Schema.optionalWith(Schema.String, {
    default: () => ProxyNameFormatDefault,
  }),
})
export type ConvertOptions = typeof ConvertOptions.Type

export const InstanceGroups = Schema.Struct({
  custom: Schema.optionalWith(CustomGroups, {
    default: () => ({}) as CustomGroups,
  }),
})
export type InstanceGroups = typeof InstanceGroups.Type

export const defaultInstanceGroups: InstanceGroups = { custom: {} }

export const FileMode = Schema.Literal("per-subscription", "aggregate", "both")
export type FileMode = typeof FileMode.Type

export const FileOutput = Schema.Struct({
  enabled: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  mode: Schema.optionalWith(FileMode, { default: () => "aggregate" as const }),
  directory: Schema.optionalWith(Schema.String, { default: () => "." }),
  path: Schema.optionalWith(Schema.String, {
    default: () => "hoyofall.json",
  }),
  permissions: Schema.optionalWith(Schema.String, { default: () => "0644" }),
  pretty: Schema.optionalWith(Schema.Boolean, { default: () => true }),
})
export type FileOutput = typeof FileOutput.Type

const defaultFileOutput: FileOutput = {
  enabled: true,
  mode: "aggregate",
  directory: ".",
  path: "hoyofall.json",
  permissions: "0644",
  pretty: true,
}

export const HttpOutput = Schema.Struct({
  enabled: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  listen: Schema.optionalWith(
    Schema.Struct({
      host: Schema.optionalWith(Schema.String, {
        default: () => "127.0.0.1",
      }),
      port: Schema.optionalWith(
        Schema.Int.pipe(Schema.between(1, 65535)),
        { default: () => 9090 },
      ),
    }),
    { default: () => ({ host: "127.0.0.1", port: 9090 }) },
  ),
})
export type HttpOutput = typeof HttpOutput.Type

const defaultHttpOutput: HttpOutput = {
  enabled: false,
  listen: { host: "127.0.0.1", port: 9090 },
}

export const Output = Schema.Struct({
  file: Schema.optionalWith(FileOutput, { default: () => defaultFileOutput }),
  http: Schema.optionalWith(HttpOutput, { default: () => defaultHttpOutput }),
})
export type Output = typeof Output.Type

export const defaultOutput: Output = {
  file: defaultFileOutput,
  http: defaultHttpOutput,
}

export const Config = Schema.Struct({
  groups: Schema.optionalWith(InstanceGroups, {
    default: () => defaultInstanceGroups,
  }),
  subscriptions: Subscriptions,
  convert: Schema.optionalWith(ConvertOptions, {
    default: () => ({
      emitBuiltinOutbounds: false,
      proxyNameFormat: ProxyNameFormatDefault,
    }),
  }),
  output: Schema.optionalWith(Output, { default: () => defaultOutput }),
})
export type Config = typeof Config.Type
