import { Effect, PubSub, Queue } from "effect"
import type { ResolvedConfig } from "../config/load"
import type { SubscriptionFragment } from "../convert/fragment"
import type { CacheMap } from "./types"

// The read side of the snapshot cache is shared by the file writer and the HTTP
// routes, so extraction lives here rather than in either consumer.

export const collectReady = (
  config: ResolvedConfig,
  cache: CacheMap,
): ReadonlyArray<SubscriptionFragment> =>
  config.subscriptions.flatMap((subscription) => {
    const state = cache[subscription.id]
    return state !== undefined && state._tag === "Ready"
      ? [state.conversion]
      : []
  })

export const takeSnapshot = (
  pubsub: PubSub.PubSub<CacheMap>,
): Effect.Effect<CacheMap> =>
  Effect.scoped(
    PubSub.subscribe(pubsub).pipe(
      Effect.flatMap((queue) => Queue.take(queue)),
    ),
  )
