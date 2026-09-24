import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import { Effect, JSONSchema, Layer, type PubSub } from "effect"
import { loadConfig, resolveConfig, type ResolvedConfig } from "./config/load"
import { Config } from "./config/schema"
import { formatDiagnostic, usage, version } from "./diagnostics"
import { UsageError } from "./errors"
import type { CacheMap } from "./pipeline/types"
import { startInstance } from "./pipeline/state"
import { serverLayer } from "./server/app"
import { makeRouter } from "./server/routes"

type Command =
  | { readonly _tag: "Help" }
  | { readonly _tag: "Version" }
  | { readonly _tag: "PrintSchema" }
  | { readonly _tag: "Run"; readonly configPath: string }

const findConfigPath = (argv: ReadonlyArray<string>): string | undefined => {
  const equals = argv.find((arg) => arg.startsWith("--config="))
  if (equals !== undefined) {
    return equals.slice("--config=".length)
  }
  const index = argv.findIndex((arg) => arg === "--config" || arg === "-c")
  return index >= 0 ? argv[index + 1] : undefined
}

const parseCommand = (
  argv: ReadonlyArray<string>,
): Effect.Effect<Command, UsageError> => {
  if (argv.includes("--help") || argv.includes("-h")) {
    return Effect.succeed({ _tag: "Help" })
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    return Effect.succeed({ _tag: "Version" })
  }
  if (argv.includes("--print-schema")) {
    return Effect.succeed({ _tag: "PrintSchema" })
  }
  const configPath = findConfigPath(argv)
  return configPath === undefined || configPath.startsWith("-")
    ? Effect.fail(new UsageError({ message: "Missing required option: --config <path>." }))
    : Effect.succeed({ _tag: "Run", configPath })
}

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
