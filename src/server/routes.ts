import { HttpRouter, HttpServerResponse } from "@effect/platform"
import { Effect, PubSub, Queue } from "effect"
import type { ResolvedConfig } from "../config/load"
import { withBuiltinOutbounds } from "../convert/fragment"
import type { CacheMap } from "../pipeline/types"

const loadSnapshot = (
  pubsub: PubSub.PubSub<CacheMap>,
): Effect.Effect<CacheMap> =>
  Effect.scoped(
    PubSub.subscribe(pubsub).pipe(
      Effect.flatMap((queue) => Queue.take(queue)),
    ),
  )

export const makeRouter = (
  config: ResolvedConfig,
  pubsub: PubSub.PubSub<CacheMap>,
) => {
  const snapshot = loadSnapshot(pubsub)

  const subscriptionHandler = (raw: boolean) =>
    Effect.gen(function* () {
      const params = yield* HttpRouter.params
      const id = params["id"]
      const cache = yield* snapshot
      const state = id === undefined ? undefined : cache[id]
      if (state === undefined) {
        return HttpServerResponse.unsafeJson(
          { error: "unknown subscription", id },
          { status: 404 },
        )
      }
      if (state._tag === "Failed") {
        return HttpServerResponse.unsafeJson(
          { error: "subscription not ready", detail: state.error, updatedAt: state.updatedAt },
          { status: 503 },
        )
      }
      const fragment = withBuiltinOutbounds(
        state.fragment,
        config.convert.emitBuiltinOutbounds,
      )
      return HttpServerResponse.unsafeJson(
        raw ? fragment.outbounds : fragment,
        { status: 200, contentType: "application/json" },
      )
    })

  return HttpRouter.empty.pipe(
    HttpRouter.get(
      "/",
      Effect.succeed(
        HttpServerResponse.unsafeJson({
          name: "hoyofall",
          subscriptions: config.subscriptions.map((subscription) => subscription.id),
          output: {
            file: config.output.file.enabled ? config.output.file.mode : null,
            http: config.output.http.enabled,
          },
        }),
      ),
    ),
    HttpRouter.get(
      "/health",
      Effect.succeed(
        HttpServerResponse.unsafeJson({ status: "ok" }, { status: 200 }),
      ),
    ),
    HttpRouter.get("/sub/:id", subscriptionHandler(false)),
    HttpRouter.get("/sub/:id/raw", subscriptionHandler(true)),
  )
}
