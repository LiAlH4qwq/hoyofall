import { FileSystem } from "@effect/platform"
import { Effect, ParseResult, Schema } from "effect"
import { parse as parseYaml } from "yaml"
import {
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
} from "../errors"
import { Config, type ConvertOptions, type Output, type Subscription } from "./schema"

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
      config.subscriptions.map(subscriptionIssuesOf),
    )

    const issues = [...outputIssues, ...subscriptionIssues.flat()]
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

const subscriptionIssuesOf = (
  subscription: Subscription,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const hasUrl = "url" in subscription && subscription.url !== undefined
    const hasUrlEnv = "urlEnv" in subscription
    const sourceIssues = hasUrl || hasUrlEnv
      ? []
      : [`subscriptions.${subscription.id}: one of url or urlEnv is required`]
    const invalidExcludes = yield* Effect.all(
      subscription.convert.exclude.map(isInvalidRegex),
    )
    const formatIssues = invalidExcludes.some(Boolean)
      ? [`subscriptions.${subscription.id}.convert.exclude: invalid regular expression`]
      : []
    return [...sourceIssues, ...formatIssues]
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
}

export interface ResolvedConfig {
  readonly subscriptions: ReadonlyArray<ResolvedSubscription>
  readonly convert: ConvertOptions
  readonly output: Output
}

export const resolveConfig = (
  config: Config,
): Effect.Effect<ResolvedConfig, ConfigValidationError> =>
  Effect.gen(function* () {
    const subscriptions = yield* Effect.all(
      config.subscriptions.map(
        (subscription): Effect.Effect<ResolvedSubscription, ConfigValidationError> => {
          const urlEffect =
            "url" in subscription && subscription.url !== undefined
              ? Effect.succeed(subscription.url)
              : resolveEnv(
                  "urlEnv" in subscription ? subscription.urlEnv : "",
                  subscription.id,
                )
          return urlEffect.pipe(
            Effect.map(
              (url): ResolvedSubscription => ({
                id: subscription.id,
                name: subscription.name ?? subscription.id,
                url,
                intervalSeconds: subscription.intervalSeconds,
                userAgent: subscription.userAgent,
                format: subscription.format,
                onUnsupported: subscription.onUnsupported,
                convert: subscription.convert,
              }),
            ),
          )
        },
      ),
    )
    return {
      subscriptions,
      convert: config.convert,
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
