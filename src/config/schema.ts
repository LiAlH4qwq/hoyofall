import { Schema } from "effect"

export const ProxyNameFormatDefault = "{sub}-{name}"

export const SubscriptionConvert = Schema.Struct({
  includeGroups: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  fallback: Schema.optionalWith(Schema.Literal("urltest", "skip"), {
    default: () => "urltest" as const,
  }),
  loadBalance: Schema.optionalWith(
    Schema.Literal("selector", "urltest", "skip"),
    { default: () => "selector" as const },
  ),
  exclude: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [] as ReadonlyArray<string>,
  }),
})
export type SubscriptionConvert = typeof SubscriptionConvert.Type

const SubscriptionCommon = Schema.Struct({
  id: Schema.NonEmptyString,
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
    default: () => ({
      includeGroups: false,
      fallback: "urltest" as const,
      loadBalance: "selector" as const,
      exclude: [] as ReadonlyArray<string>,
    }),
  }),
})

export const Subscription = Schema.Union(
  Schema.extend(SubscriptionCommon, Schema.Struct({ url: Schema.NonEmptyString })),
  Schema.extend(SubscriptionCommon, Schema.Struct({ urlEnv: Schema.NonEmptyString })),
)
export type Subscription = typeof Subscription.Type

export const ConvertOptions = Schema.Struct({
  emitBuiltinOutbounds: Schema.optionalWith(Schema.Boolean, {
    default: () => false,
  }),
  proxyNameFormat: Schema.optionalWith(Schema.String, {
    default: () => ProxyNameFormatDefault,
  }),
})
export type ConvertOptions = typeof ConvertOptions.Type

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
  subscriptions: Schema.Array(Subscription).pipe(
    Schema.minItems(1, {
      message: () => "must contain at least one subscription",
    }),
  ),
  convert: Schema.optionalWith(ConvertOptions, {
    default: () => ({
      emitBuiltinOutbounds: false,
      proxyNameFormat: ProxyNameFormatDefault,
    }),
  }),
  output: Schema.optionalWith(Output, { default: () => defaultOutput }),
})
export type Config = typeof Config.Type
