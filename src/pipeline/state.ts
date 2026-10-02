import { HttpClient } from "@effect/platform"
import type { FileSystem, Path } from "@effect/platform"
import {
  Clock,
  Duration,
  Effect,
  PubSub,
  Queue,
  Schedule,
  Stream,
  type Scope,
} from "effect"
import type { ResolvedConfig, ResolvedSubscription } from "../config/load"
import type { ConvertOptions, RetryOptions } from "../config/schema"
import {
  convertSubscription,
  warningMessage,
  type SubscriptionFragment,
} from "../convert/fragment"
import { FetchError } from "../errors"
import type {
  EmptyCustomGroupsError,
  GroupCycleError,
  PayloadDecodeError,
  StrictConversionError,
} from "../errors"
import { decodeSubscription } from "../mihomo/decode"
import { writeSnapshot } from "../output/file"
import type { CacheMap, SubscriptionState } from "./types"

const failureMessage = (
  error: FetchError | PayloadDecodeError | StrictConversionError | GroupCycleError,
): string => {
  switch (error._tag) {
    case "FetchError":
      return `${error.message} (${error.url})`
    case "PayloadDecodeError":
      return `payload decode failed: ${error.issues.join("; ")}`
    case "StrictConversionError":
      return `strict conversion failed: ${error.issues.join("; ")}`
    case "GroupCycleError":
      return `outbound cycle: ${error.groups.join(" -> ")}`
  }
}

const RequestTimeoutSeconds = 30

const fetchText = (
  subscription: ResolvedSubscription,
): Effect.Effect<string, FetchError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const options =
      subscription.userAgent === undefined
        ? undefined
        : { headers: { "user-agent": subscription.userAgent } }
    const response = yield* client.get(subscription.url, options).pipe(
      Effect.mapError(
        (cause) =>
          new FetchError({
            subscription: subscription.id,
            url: subscription.url,
            message: "request failed",
            cause,
          }),
      ),
    )
    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        new FetchError({
          subscription: subscription.id,
          url: subscription.url,
          message: `unexpected status ${response.status}`,
          cause: response.status,
        }),
      )
    }
    return yield* response.text.pipe(
      Effect.mapError(
        (cause) =>
          new FetchError({
            subscription: subscription.id,
            url: subscription.url,
            message: "failed to read response body",
            cause,
          }),
      ),
    )
  }).pipe(
    Effect.timeout(Duration.seconds(RequestTimeoutSeconds)),
    Effect.mapError((error) =>
      error._tag === "TimeoutException"
        ? new FetchError({
            subscription: subscription.id,
            url: subscription.url,
            message: `request timed out after ${RequestTimeoutSeconds}s`,
            cause: error,
          })
        : error,
    ),
  )

const logWarnings = (fragment: SubscriptionFragment): Effect.Effect<void> =>
  fragment.warnings.length === 0
    ? Effect.void
    : Effect.logWarning(
        `subscription ${fragment.subscriptionId} converted with warnings:\n${fragment.warnings
          .map(warningMessage)
          .join("\n")}`,
      )

const failedSubscription = (
  subscriptionId: string,
  message: string,
): Effect.Effect<SubscriptionState> =>
  Effect.gen(function* () {
    yield* Effect.logWarning(`subscription ${subscriptionId}: ${message}`)
    const updatedAt = yield* Clock.currentTimeMillis
    const state: SubscriptionState = { _tag: "Failed", error: message, updatedAt }
    return state
  })

const refreshOne = (
  subscription: ResolvedSubscription,
  convert: ConvertOptions,
): Effect.Effect<SubscriptionState, never, HttpClient.HttpClient> =>
  fetchText(subscription).pipe(
    Effect.flatMap((text) =>
      decodeSubscription(subscription.id, text, subscription.format),
    ),
    Effect.flatMap((decoded) => convertSubscription(subscription, decoded, convert)),
    Effect.tap(logWarnings),
    Effect.flatMap((fragment) =>
      Effect.gen(function* () {
        const updatedAt = yield* Clock.currentTimeMillis
        const state: SubscriptionState = {
          _tag: "Ready",
          conversion: fragment,
          warnings: fragment.warnings,
          updatedAt,
          lastError: undefined,
        }
        return state
      }),
    ),
    Effect.catchTags({
      FetchError: (error) =>
        failedSubscription(subscription.id, failureMessage(error)),
      PayloadDecodeError: (error) =>
        failedSubscription(subscription.id, failureMessage(error)),
      StrictConversionError: (error) =>
        failedSubscription(subscription.id, failureMessage(error)),
      GroupCycleError: (error) =>
        failedSubscription(subscription.id, failureMessage(error)),
    }),
  )

export const applyUpdate = (
  cache: CacheMap,
  update: { readonly id: string; readonly result: SubscriptionState },
): CacheMap => {
  const previous = cache[update.id]
  const next: SubscriptionState =
    update.result._tag === "Ready"
      ? update.result
      : previous !== undefined && previous._tag === "Ready"
        ? { ...previous, lastError: update.result.error }
        : update.result
  return { ...cache, [update.id]: next }
}

// A refresh schedule whose delay depends on the outcome: on success wait the
// subscription interval, on failure back off exponentially (starting at
// `baseSeconds`, capped at `maxSeconds` and never exceeding the normal
// interval). The first refresh always runs immediately. `passthrough` makes the
// delay depend on the `SubscriptionState`; `resetWhen` restarts the backoff
// after a successful refresh.
export const retrySchedule = (
  intervalSeconds: number,
  retry: RetryOptions,
): Schedule.Schedule<SubscriptionState, SubscriptionState> => {
  const interval = Duration.seconds(intervalSeconds)
  const retryCap = Duration.min(Duration.seconds(retry.maxSeconds), interval)
  return Schedule.exponential(Duration.seconds(retry.baseSeconds)).pipe(
    Schedule.mapInput((state: SubscriptionState) => state),
    Schedule.passthrough,
    Schedule.resetWhen((state) => state._tag === "Ready"),
    Schedule.modifyDelay((state, duration) =>
      state._tag === "Ready" ? interval : Duration.min(duration, retryCap),
    ),
  )
}

const updateStream = (
  subscription: ResolvedSubscription,
  convert: ConvertOptions,
  retry: RetryOptions,
): Stream.Stream<{ readonly id: string; readonly result: SubscriptionState }, never, HttpClient.HttpClient> =>
  Stream.repeatEffectWithSchedule(
    refreshOne(subscription, convert),
    retrySchedule(subscription.intervalSeconds, retry),
  ).pipe(
    Stream.map((result) => ({ id: subscription.id, result })),
  )

export const snapshotStream = (
  config: ResolvedConfig,
): Stream.Stream<CacheMap, never, HttpClient.HttpClient> =>
  Stream.mergeAll(
    config.subscriptions.map((subscription) =>
      updateStream(subscription, config.convert, config.retry),
    ),
    { concurrency: "unbounded" },
  ).pipe(
    // `Stream.mapAccum` (unlike `Stream.scan`) does not emit the initial state,
    // so we never write an empty fragment before the first refresh completes.
    Stream.mapAccum(emptyCache, (cache, update) => {
      const next = applyUpdate(cache, update)
      return [next, next] as const
    }),
  )

export interface InstanceRuntime {
  readonly pubsub: PubSub.PubSub<CacheMap>
}

const emptyCache: CacheMap = {}

export const startInstance = (
  config: ResolvedConfig,
): Effect.Effect<
  InstanceRuntime,
  never,
  HttpClient.HttpClient | FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<CacheMap>({ replay: 1 })
    const stream = snapshotStream(config).pipe(
      Stream.tap((cache) =>
        writeSnapshot(config, cache).pipe(
          Effect.catchTags({
            OutputWriteError: (error) =>
              Effect.logError(
                `failed to write output at ${error.path}: ${String(error.cause)}`,
              ),
            DuplicateTagError: (error) =>
              Effect.logError(
                `refusing to write output: duplicate outbound tags ${error.tags.join(", ")}`,
              ),
            EmptyCustomGroupsError: (error: EmptyCustomGroupsError) =>
              Effect.logError(
                `refusing to write output: ${error.groups
                  .map(warningMessage)
                  .join("; ")}`,
              ),
            GroupCycleError: (error: GroupCycleError) =>
              Effect.logError(
                `refusing to write output: ${error.scope}: outbound cycle ${error.groups.join(", ")}`,
              ),
          }),
        ),
      ),
    )
    yield* stream.pipe(
      Stream.runForEach((snapshot) => PubSub.publish(pubsub, snapshot)),
      Effect.forkScoped,
    )
    yield* Effect.scoped(
      PubSub.subscribe(pubsub).pipe(
        Effect.flatMap((queue) => Queue.take(queue)),
      ),
    )
    return { pubsub }
  })
