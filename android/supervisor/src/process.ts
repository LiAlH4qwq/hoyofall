import { Effect } from "effect"
import { execFile, spawn, type ChildProcess } from "node:child_process"
import { createWriteStream, type WriteStream } from "node:fs"
import { CommandError } from "./errors"

export interface CommandResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

// Run a finite command and capture its output. The callback is the Effect
// boundary; the rest of the program stays in Effect.
export const runCommand = (
  argv: ReadonlyArray<string>,
  env: NodeJS.ProcessEnv = process.env,
): Effect.Effect<CommandResult, CommandError> =>
  Effect.async<CommandResult, CommandError>((resume) => {
    const executable = argv[0]
    if (executable === undefined) {
      resume(
        Effect.fail(new CommandError({ message: "empty command", command: "" })),
      )
      return Effect.void
    }
    execFile(
      executable,
      argv.slice(1),
      { env },
      (error, stdout, stderr) => {
        const code =
          error === null ? 0 : typeof error.code === "number" ? error.code : 1
        resume(
          Effect.succeed({ code, stdout: String(stdout), stderr: String(stderr) }),
        )
      },
    )
    return Effect.void
  })

// `pgrep -f` exits non-zero when nothing matches; a missing process is not an
// error, so that case resolves to an empty list (matching the old Nushell
// supervisor, which caught every failure).
export const pids = (pattern: string): Effect.Effect<ReadonlyArray<number>> =>
  Effect.async<ReadonlyArray<number>>((resume) => {
    execFile("pgrep", ["-f", pattern], (error, stdout) => {
      if (error !== null) {
        resume(Effect.succeed([]))
        return
      }
      const list = String(stdout)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "")
        .map((line) => Number.parseInt(line, 10))
        .filter((value) => Number.isFinite(value))
      resume(Effect.succeed(list))
    })
    return Effect.void
  })

export const killPid = (pid: number): Effect.Effect<void> =>
  Effect.ignore(
    Effect.try({
      try: () => process.kill(pid, "SIGTERM"),
      catch: () => undefined,
    }),
  )

export interface ChildHandle {
  readonly child: ChildProcess
  readonly log: WriteStream
}

// Spawn a supervised long-running process, appending its stdout+stderr to the
// service log. Releasing the handle ends the stream and stops the child.
export const startChild = (
  bin: string,
  args: ReadonlyArray<string>,
  logPath: string,
  env: NodeJS.ProcessEnv,
): Effect.Effect<ChildHandle> =>
  Effect.sync(() => {
    const log = createWriteStream(logPath, { flags: "a" })
    const child = spawn(bin, [...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    child.stdout?.pipe(log, { end: false })
    child.stderr?.pipe(log, { end: false })
    return { child, log }
  })

const awaitChild = (handle: ChildHandle): Effect.Effect<number> =>
  Effect.tryPromise({
    try: () =>
      new Promise<number>((resolve) => {
        handle.child.once("exit", (code) => resolve(code ?? 1))
        handle.child.once("error", () => resolve(1))
      }),
    catch: () => new CommandError({ message: "spawn failed", command: "spawn" }),
  }).pipe(Effect.catchTag("CommandError", () => Effect.succeed(1)))

export const runChild = (
  bin: string,
  args: ReadonlyArray<string>,
  logPath: string,
  env: NodeJS.ProcessEnv,
): Effect.Effect<number> =>
  Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* Effect.acquireRelease(
        startChild(bin, args, logPath, env),
        (value) =>
          Effect.sync(() => {
            value.log.end()
            value.child.kill("SIGTERM")
          }),
      )
      return yield* awaitChild(handle)
    }),
  )
