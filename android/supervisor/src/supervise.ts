import { Duration, Effect, Schedule, Stream } from "effect"
import { join } from "node:path"
import type { FsError } from "./errors"
import { childEnvironment } from "./env"
import { exists, makeDirectory, readText, readTextOption, writeText } from "./files"
import { hashText } from "./hash"
import { loadTokenEnv } from "./dotenv"
import { note } from "./log"
import { runChild, runCommand, type CommandResult } from "./process"
import { serviceSpec, stopService, type ServiceName } from "./services"

// Supervise one service: restart it on exit, honour its "stopped" flag file.
export const superviseService = (
  name: ServiceName,
  delaySeconds: number,
): Effect.Effect<never, FsError> =>
  Effect.gen(function* () {
    const spec = serviceSpec(name)
    if (!(yield* exists(spec.bin))) {
      yield* note(`skipping ${name}: ${spec.bin} missing`)
      return yield* Effect.never
    }
    yield* note(`supervising ${name} -> ${spec.log}`)
    yield* Effect.forever(
      Effect.gen(function* () {
        if (yield* exists(spec.flag)) {
          yield* Effect.sleep(Duration.seconds(2))
          return
        }
        const tokenEnv = yield* loadTokenEnv()
        const code = yield* runChild(
          spec.bin,
          spec.args,
          spec.log,
          childEnvironment(tokenEnv),
        )
        yield* note(`${name} exited (${code}); restarting in ${delaySeconds}s`)
        yield* Effect.sleep(Duration.seconds(delaySeconds))
      }),
    )
    return yield* Effect.never
  })

// A stream of fragment hashes that emits only on change. `drop(1)` seeds the
// previous value from the file's current content, so a restart is not triggered
// merely because the fragment exists at boot.
const fragmentChanges = (
  outFile: string,
  intervalSeconds: number,
): Stream.Stream<string, FsError> =>
  Stream.fromSchedule(Schedule.spaced(Duration.seconds(intervalSeconds))).pipe(
    Stream.mapEffect(() => readTextOption(outFile)),
    Stream.map((text) => (text === null ? "" : hashText(text))),
    Stream.changes,
    Stream.drop(1),
  )

const injectFragment = (
  outFile: string,
  targetDir: string,
  targetName: string,
  reload: ReadonlyArray<string>,
): Effect.Effect<void, FsError> =>
  Effect.gen(function* () {
    const text = yield* readText(outFile)
    yield* makeDirectory(targetDir)
    const target = join(targetDir, targetName)
    yield* writeText(target, text)
    yield* note(`injected fragment -> ${target}`)
    if (reload.length > 0) {
      const result: CommandResult = yield* runCommand(reload).pipe(
        Effect.catchTag("CommandError", (error) =>
          Effect.succeed({ code: 1, stdout: "", stderr: error.message }),
        ),
      )
      yield* note(
        result.code === 0
          ? "ran the sing-box reload hook"
          : `reload hook failed: ${result.stderr.trim()}`,
      )
    }
  })

// Poll the aggregate fragment and, on change, copy it into an external sing-box
// module's config directory and run the configured reload hook. The bundled
// sing-box reads hoyofall's `out` dir directly via `-C`; this is for users who
// run a separate sing-box module.
export const watchAndInject = (
  outFile: string,
  targetDir: string,
  targetName: string,
  reload: ReadonlyArray<string>,
  intervalSeconds: number,
): Effect.Effect<void, FsError> =>
  fragmentChanges(outFile, intervalSeconds).pipe(
    Stream.runForEach(() =>
      injectFragment(outFile, targetDir, targetName, reload),
    ),
  )

// Restart a service when hoyofall writes a new fragment (sing-box reads its
// config once).
export const restartOnFragmentChange = (
  outFile: string,
  intervalSeconds: number,
): Effect.Effect<void, FsError> =>
  fragmentChanges(outFile, intervalSeconds).pipe(
    Stream.runForEach(() =>
      note("fragment changed; restarting sing-box").pipe(
        Effect.zipRight(stopService("sing-box")),
      ),
    ),
  )
