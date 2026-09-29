import { FileSystem } from "@effect/platform"
import { Effect, ParseResult, Schema } from "effect"
import {
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
} from "../errors"
import { parseYamlUnknown } from "../yaml"
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

    // Each scope's custom-group levels, and every subscription's levels (so a
    // global group can be validated against the subscription it references).
    const subscriptionLevels: Readonly<
      Record<string, Readonly<Record<string, number>>>
    > = Object.fromEntries(
      Object.entries(config.subscriptions).map(([subscriptionId, subscription]) => [
        subscriptionId,
        Object.fromEntries(
          Object.entries(subscription.groups.custom).map(([groupId, group]) => [
            groupId,
            group.level,
          ]),
        ),
      ]),
    )
    const globalLevels: Readonly<Record<string, number>> = Object.fromEntries(
      Object.entries(config.groups.custom).map(([groupId, group]) => [
        groupId,
        group.level,
      ]),
    )

    const subscriptionIssues = yield* Effect.all(
      Object.entries(config.subscriptions).map(([id, subscription]) =>
        subscriptionIssuesOf(
          id,
          subscription,
          subscriptionLevels[id] ?? {},
          subscriptionLevels,
        ),
      ),
    )

    const instanceGroupIssues = yield* Effect.all(
      Object.entries(config.groups.custom).map(([id, group]) =>
        customGroupIssues(
          "groups",
          id,
          group,
          true,
          globalLevels,
          subscriptionLevels,
        ),
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
  allowSubRegexes: boolean,
  sameScopeLevels: Readonly<Record<string, number>>,
  subscriptionLevels: Readonly<Record<string, Readonly<Record<string, number>>>>,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const label = `${scope}.custom.${id}`
    const regexFields: ReadonlyArray<readonly [string, ReadonlyArray<string>]> =
      [
        ["includeSubRegexes", group.includeSubRegexes],
        ["excludeSubRegexes", group.excludeSubRegexes],
        ["includeRegexes", group.includeRegexes],
        ["excludeRegexes", group.excludeRegexes],
      ]
    const regexIssueLists = yield* Effect.all(
      regexFields.map(([field, patterns]) =>
        regexIssues(`${label}.${field}`, patterns),
      ),
    )
    const subIssue =
      !allowSubRegexes &&
      (group.includeSubRegexes.length > 0 ||
        group.excludeSubRegexes.length > 0)
        ? [
            `${label}: includeSubRegexes/excludeSubRegexes are only valid for instance-level groups`,
          ]
        : []
    const levelIssue = group.includeLevels.some(
      (level) => level >= group.level,
    )
      ? [
          `${label}.includeLevels: every level must be lower than this group's level ${group.level}`,
        ]
      : []
    // Custom-group membership must form a DAG: only strictly lower levels in the
    // same scope, or (global only) a custom group in a per-subscription scope.
    const memberIssues = group.members.flatMap(
      (member): ReadonlyArray<string> => {
        if (member.type !== "customGroup") {
          return []
        }
        if (member.subscription !== undefined) {
          if (!allowSubRegexes) {
            return [
              `${label}.members: customGroup members cannot set subscription in a subscription-scoped group`,
            ]
          }
          const levels = subscriptionLevels[member.subscription]
          if (levels === undefined) {
            return [
              `${label}.members: unknown subscription ${member.subscription}`,
            ]
          }
          return member.name in levels
            ? []
            : [
                `${label}.members: unknown custom group ${member.subscription}/${member.name}`,
              ]
        }
        const memberLevel = sameScopeLevels[member.name]
        if (memberLevel === undefined) {
          return [`${label}.members: unknown custom group ${member.name}`]
        }
        return memberLevel < group.level
          ? []
          : [
              `${label}.members: custom group ${member.name} (level ${memberLevel}) must be lower than level ${group.level}`,
            ]
      },
    )
    return [
      ...regexIssueLists.flat(),
      ...subIssue,
      ...levelIssue,
      ...memberIssues,
    ]
  })

const subscriptionIssuesOf = (
  id: string,
  subscription: Subscription,
  sameScopeLevels: Readonly<Record<string, number>>,
  subscriptionLevels: Readonly<Record<string, Readonly<Record<string, number>>>>,
): Effect.Effect<ReadonlyArray<string>> =>
  Effect.gen(function* () {
    const excludeIssues = yield* regexIssues(
      `subscriptions.${id}.convert.exclude`,
      subscription.convert.exclude,
    )
    const nativeIssues = yield* Effect.all([
      regexIssues(
        `subscriptions.${id}.groups.native.includeRegexes`,
        subscription.groups.native.includeRegexes,
      ),
      regexIssues(
        `subscriptions.${id}.groups.native.excludeRegexes`,
        subscription.groups.native.excludeRegexes,
      ),
    ])
    const customIssues = yield* Effect.all(
      Object.entries(subscription.groups.custom).map(([groupId, group]) =>
        customGroupIssues(
          `subscriptions.${id}.groups`,
          groupId,
          group,
          false,
          sameScopeLevels,
          subscriptionLevels,
        ),
      ),
    )
    return [
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
      try: () => parseYamlUnknown(content),
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
            subscription.url !== undefined
              ? Effect.succeed(subscription.url)
              : resolveEnv(subscription.urlEnv ?? "", id)
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
