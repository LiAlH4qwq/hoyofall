import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { control } from "./control"
import { formatError, UsageError } from "./errors"
import { postFsData } from "./post-fs-data"
import { runService } from "./service"
import { uninstall } from "./uninstall"

// One bundle, dispatched by the first argument so the Magisk/KernelSU shims stay
// a single `exec` of `bin/node supervisor.js <command>`:
//   service | control | post-fs-data | uninstall
const program = Effect.gen(function* () {
  const argv = yield* Effect.sync(() => process.argv.slice(2))
  const command = argv[0] ?? ""
  const rest = argv.slice(1)
  switch (command) {
    case "service":
      return yield* runService()
    case "control":
      return yield* control(rest)
    case "post-fs-data":
      return yield* postFsData()
    case "uninstall":
      return yield* uninstall()
    default:
      return yield* Effect.fail(
        new UsageError({
          message: `unknown command (${command}): service | control | post-fs-data | uninstall`,
        }),
      )
  }
})

NodeRuntime.runMain(
  Effect.scoped(
    program.pipe(
      Effect.tapError((error) =>
        Effect.sync(() => {
          process.stderr.write(`${formatError(error)}\n`)
        }),
      ),
    ),
  ),
  { disableErrorReporting: true },
)
