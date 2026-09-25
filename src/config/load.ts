import { FileSystem } from "@effect/platform"
import { Effect, ParseResult, Schema } from "effect"
import { parse as parseYaml } from "yaml"
import {
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
} from "../errors"
import { Config, type ConvertOptions, type CustomGroup, type InstanceGroups, type Output, type Subscription, type SubscriptionGroups } from "./schema"

export const decodeConfig = (
  parsed: unknown,
  path: string,
): Effect.Effect<Config, ConfigParseError> =>
  Schema.decodeUnknown(Config, { errors: "all" })(parsed).pipe(
    Effect.mapError(
      (error) =>
        new ConfigParseError({
          path,
          issues: ParseResult.ArrayFormatter.formatErrorSync(error).map(
            (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
          ),
        }),
    ),
  )

export const validateConfig = (
  config: Config,
): Effect.Effect<Config, ConfigValidationError> =>
  Effect.gen(function* () {
    const output: Output = config.output

    const outputIssues = output.file.enabled || output.http.enabled
      ? []
      : ["output: at least one of output.file or output.http must be enabled"]

    const subscriptionIssues = yield* Effect.all(
      Object.entries(config.subscriptions).map(([id, subscription]) =>
        subscriptionIssuesOf(id, subscription),
      ),
    )

    const instanceGroupIssues = yield* Effect.all(
      Object.entries(config.groups.custom).map(([id, group]) =>
        customGroupIssues("groups", id, group),
      ),
    )

    const issues = [
      ...outputIssues,
      ...subscriptionIssues.flat(),
      ...instanceGroupIssues.flat(),
    ]
    if (issues.length > 0) {
      return yield* Effect.fail(new ConfigValidationError({ issues }))
    }
    return config
  })

const isInvalidRegex = (pattern: string): Effect.Effect<boolean> =>
  Effect.match(
    Effect.try({
      try: () => new RegExp(pattern),
      catch: () => "invalid" as const,
    }),
    { onFailure: () => true, onSuccess: () => false },
  )

const regexIssues = (
  label: string,
  patterns: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const invalid = yield* Effect.all(patterns.map(isInvalidRegex))
    return invalid.some(Boolean)
      ? [`${label}: invalid regular expression`]
      : []
  })

const customGroupIssues = (
  scope: string,
  id: string,
  group: CustomGroup,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const label = `${scope}.custom.${id}`
    const includeIssues = yield* regexIssues(`${label}.includeRegex`, group.includeRegex)
    const excludeIssues = yield* regexIssues(`${label}.excludeRegex`, group.excludeRegex)
    return [...includeIssues, ...excludeIssues]
  })

const subscriptionIssuesOf = (
  id: string,
  subscription: Subscription,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const hasUrl = "url" in subscription && subscription.url !== undefined
    const hasUrlEnv = "urlEnv" in subscription
    const sourceIssues = hasUrl || hasUrlEnv
      ? []
      : [`subscriptions.${id}: one of url or urlEnv is required`]
    const excludeIssues = yield* regexIssues(
      `subscriptions.${id}.convert.exclude`,
      subscription.convert.exclude,
    )
    const nativeIssues = yield* Effect.all([
      regexIssues(
        `subscriptions.${id}.groups.native.includeRegex`,
        subscription.groups.native.includeRegex,
      ),
      regexIssues(
        `subscriptions.${id}.groups.native.excludeRegex`,
        subscription.groups.native.excludeRegex,
      ),
    ])
    const customIssues = yield* Effect.all(
      Object.entries(subscription.groups.custom).map(([groupId, group]) =>
        customGroupIssues(`subscriptions.${id}.groups`, groupId, group),
      ),
    )
    return [
      ...sourceIssues,
      ...excludeIssues,
      ...nativeIssues.flat(),
      ...customIssues.flat(),
    ]
  })

export const loadConfig = (
  path: string,
): Effect.Effect<
  Config,
  ConfigReadError | ConfigParseError | ConfigValidationError,
  FileSystem.FileSystem
> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const content = yield* fs
      .readFileString(path)
      .pipe(Effect.mapError((cause) => new ConfigReadError({ path, cause })))
    const parsed = yield* Effect.try({
      try: () => parseYaml(content) as unknown,
      catch: (cause) =>
        new ConfigParseError({
          path,
          issues: [String(cause)],
        }),
    })
    const decoded = yield* decodeConfig(parsed, path)
    return yield* validateConfig(decoded)
  })

export interface ResolvedSubscription {
  readonly id: string
  readonly name: string
  readonly url: string
  readonly intervalSeconds: number
  readonly userAgent: string | undefined
  readonly format: "auto" | "clash" | "base64"
  readonly onUnsupported: "skip" | "fail"
  readonly convert: Subscription["convert"]
  readonly groups: SubscriptionGroups
}

export interface ResolvedConfig {
  readonly subscriptions: ReadonlyArray<ResolvedSubscription>
  readonly convert: ConvertOptions
  readonly groups: InstanceGroups
  readonly output: Output
}

export const resolveConfig = (
  config: Config,
): Effect.Effect<ResolvedConfig, ConfigValidationError> =>
  Effect.gen(function* () {
    const subscriptions = yield* Effect.all(
      Object.entries(config.subscriptions).map(
        ([id, subscription]): Effect.Effect<ResolvedSubscription, ConfigValidationError> => {
          const urlEffect =
            "url" in subscription && subscription.url !== undefined
              ? Effect.succeed(subscription.url)
              : resolveEnv(
                  "urlEnv" in subscription ? subscription.urlEnv : "",
                  id,
                )
          return urlEffect.pipe(
            Effect.map(
              (url): ResolvedSubscription => ({
                id,
                name: subscription.name ?? id,
                url,
                intervalSeconds: subscription.intervalSeconds,
                userAgent: subscription.userAgent,
                format: subscription.format,
                onUnsupported: subscription.onUnsupported,
                convert: subscription.convert,
                groups: subscription.groups,
              }),
            ),
          )
        },
      ),
    )
    return {
      subscriptions,
      convert: config.convert,
      groups: config.groups,
      output: config.output,
    }
  })

const resolveEnv = (
  name: string,
  subscriptionId: string,
): Effect.Effect<string, ConfigValidationError> =>
  Effect.sync(() => process.env[name]).pipe(
    Effect.flatMap((value) =>
      value === undefined || value === ""
        ? Effect.fail(
            new ConfigValidationError({
              issues: [
                `subscriptions.${subscriptionId}: environment variable ${name} is not set`,
              ],
            }),
          )
        : Effect.succeed(value),
    ),
  )
