import { HttpClient } from "@effect/platform"
import type { FileSystem, Path } from "@effect/platform"
import {
  Duration,
  Effect,
  PubSub,
  Queue,
  Schedule,
  Stream,
  type Scope,
} from "effect"
import type { ResolvedConfig, ResolvedSubscription } from "../config/load"
import type { ConvertOptions } from "../config/schema"
import {
  convertSubscription,
  warningMessage,
  type SubscriptionFragment,
} from "../convert/fragment"
import { FetchError } from "../errors"
import type { PayloadDecodeError, StrictConversionError } from "../errors"
import { decodeSubscription } from "../mihomo/decode"
import { writeSnapshot } from "../output/file"
import type { CacheMap, SubscriptionState } from "./types"

const failureMessage = (
  error: FetchError | PayloadDecodeError | StrictConversionError,
): string => {
  switch (error._tag) {
    case "FetchError":
      return `${error.message} (${error.url})`
    case "PayloadDecodeError":
      return `payload decode failed: ${error.issues.join("; ")}`
    case "StrictConversionError":
      return `strict conversion failed: ${error.issues.join("; ")}`
  }
}

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
  })

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
  Effect.logWarning(`subscription ${subscriptionId}: ${message}`).pipe(
    Effect.as<SubscriptionState>({
      _tag: "Failed",
      error: message,
      updatedAt: Date.now(),
    }),
  )

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
    Effect.map(
      (fragment): SubscriptionState => ({
        _tag: "Ready",
        fragment: fragment.fragment,
        warnings: fragment.warnings,
        updatedAt: Date.now(),
        lastError: undefined,
      }),
    ),
    Effect.catchTags({
      FetchError: (error) =>
        failedSubscription(subscription.id, failureMessage(error)),
      PayloadDecodeError: (error) =>
        failedSubscription(subscription.id, failureMessage(error)),
      StrictConversionError: (error) =>
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

const updateStream = (
  subscription: ResolvedSubscription,
  convert: ConvertOptions,
): Stream.Stream<{ readonly id: string; readonly result: SubscriptionState }, never, HttpClient.HttpClient> =>
  Stream.concat(
    Stream.make(undefined),
    Stream.fromSchedule(Schedule.spaced(Duration.seconds(subscription.intervalSeconds))),
  ).pipe(
    Stream.mapEffect(() =>
      refreshOne(subscription, convert).pipe(
        Effect.map((result) => ({ id: subscription.id, result })),
      ),
    ),
  )

export const snapshotStream = (
  config: ResolvedConfig,
): Stream.Stream<CacheMap, never, HttpClient.HttpClient> =>
  Stream.mergeAll(
    config.subscriptions.map((subscription) =>
      updateStream(subscription, config.convert),
    ),
    { concurrency: "unbounded" },
  ).pipe(Stream.scan({} as CacheMap, applyUpdate))

export interface InstanceRuntime {
  readonly pubsub: PubSub.PubSub<CacheMap>
}

export const startInstance = (
  config: ResolvedConfig,
): Effect.Effect<
  InstanceRuntime,
  never,
  HttpClient.HttpClient | FileSystem.FileSystem | Path.Path | Scope.Scope
> =>
  Effect.gen(function* () {
    const pubsub = yield* PubSub.unbounded<CacheMap>({ replay: 1 })
    const subscriptionIds = config.subscriptions.map(
      (subscription) => subscription.id,
    )
    const stream = snapshotStream(config).pipe(
      Stream.tap((cache) =>
        writeSnapshot(
          config.output,
          config.convert.emitBuiltinOutbounds,
          subscriptionIds,
          cache,
        ).pipe(
          Effect.catchTag("OutputWriteError", (error) =>
            Effect.logError(
              `failed to write output at ${error.path}: ${String(error.cause)}`,
            ),
          ),
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
