import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import { Effect, JSONSchema, Layer, type PubSub } from "effect"
import { parseCommand } from "./cli"
import { loadConfig, resolveConfig, type ResolvedConfig } from "./config/load"
import { Config } from "./config/schema"
import { formatDiagnostic, usage, version } from "./diagnostics"
import type { CacheMap } from "./pipeline/types"
import { startInstance } from "./pipeline/state"
import { serverLayer } from "./server/app"
import { makeRouter } from "./server/routes"

const write = (text: string, to: "stdout" | "stderr"): Effect.Effect<void> =>
  Effect.sync(() => {
    const stream = to === "stdout" ? process.stdout : process.stderr
    stream.write(text)
  })

const runServer = (
  resolved: ResolvedConfig,
  pubsub: PubSub.PubSub<CacheMap>,
) =>
  resolved.output.http.enabled
    ? Effect.logInfo(
        `HTTP server listening on ${resolved.output.http.listen.host}:${resolved.output.http.listen.port}`,
      ).pipe(
        Effect.zipRight(
          Layer.launch(
            serverLayer(makeRouter(resolved, pubsub), resolved.output.http.listen),
          ),
        ),
      )
    : Effect.void

const program = Effect.gen(function* () {
  const argv = yield* Effect.sync(() => process.argv.slice(2))
  const command = yield* parseCommand(argv)

  switch (command._tag) {
    case "Help": {
      yield* write(usage, "stdout")
      return
    }
    case "Version": {
      yield* write(`hoyofall ${version}\n`, "stdout")
      return
    }
    case "PrintSchema": {
      yield* write(`${JSON.stringify(JSONSchema.make(Config), null, 2)}\n`, "stdout")
      return
    }
    case "Check": {
      yield* Effect.logInfo(`checking configuration ${command.configPath}`)
      const config = yield* loadConfig(command.configPath)
      yield* write(
        `configuration ok (${Object.keys(config.subscriptions).length} subscription(s))\n`,
        "stdout",
      )
      return
    }
    case "Run": {
      yield* Effect.logInfo(`loading configuration from ${command.configPath}`)
      const config = yield* loadConfig(command.configPath)
      const resolved = yield* resolveConfig(config)
      const instance = yield* startInstance(resolved)
      yield* Effect.logInfo(
        `hoyofall started (${resolved.subscriptions.length} subscription(s))`,
      )
      yield* runServer(resolved, instance.pubsub)
      yield* Effect.never
    }
  }
})

const main = program.pipe(
  Effect.tapError((error) =>
    write(`${formatDiagnostic(error)}\n`, "stderr"),
  ),
)

const MainLayer = Layer.mergeAll(NodeContext.layer, NodeHttpClient.layer)

NodeRuntime.runMain(Effect.provide(Effect.scoped(main), MainLayer), {
  disableErrorReporting: true,
})
