import { Effect } from "effect"
import { existsSync } from "node:fs"
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import { FsError } from "./errors"

const fsError =
  (operation: string, path: string) =>
  (cause: unknown): FsError =>
    new FsError({
      message: `${operation} failed: ${path}`,
      operation,
      path,
      cause,
    })

export const exists = (path: string): Effect.Effect<boolean> =>
  Effect.sync(() => existsSync(path))

export const readText = (path: string): Effect.Effect<string, FsError> =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: fsError("readFile", path),
  })

export const readTextOption = (
  path: string,
): Effect.Effect<string | null, FsError> =>
  exists(path).pipe(
    Effect.flatMap((present) =>
      present ? readText(path) : Effect.succeed(null),
    ),
  )

export const writeText = (
  path: string,
  content: string,
): Effect.Effect<void, FsError> =>
  Effect.tryPromise({
    try: () => writeFile(path, content),
    catch: fsError("writeFile", path),
  })

export const makeDirectory = (path: string): Effect.Effect<void, FsError> =>
  Effect.tryPromise({
    try: () => mkdir(path, { recursive: true }),
    catch: fsError("mkdir", path),
  }).pipe(Effect.asVoid)

export const remove = (path: string): Effect.Effect<void, FsError> =>
  Effect.tryPromise({
    try: () => rm(path, { force: true }),
    catch: fsError("rm", path),
  })

export const copy = (from: string, to: string): Effect.Effect<void, FsError> =>
  Effect.tryPromise({
    try: () => copyFile(from, to),
    catch: fsError("copyFile", to),
  })

export const move = (from: string, to: string): Effect.Effect<void, FsError> =>
  Effect.tryPromise({
    try: () => rename(from, to),
    catch: fsError("rename", to),
  })

export const chmodSafe = (
  path: string,
  mode: number,
): Effect.Effect<void, FsError> =>
  Effect.tryPromise({
    try: () => chmod(path, mode),
    catch: fsError("chmod", path),
  })

// Write next to the target then rename, so a crash never leaves a half-written
// file for the supervisor to read.
export const commitAtomic = (
  target: string,
  content: string,
  suffix: string,
): Effect.Effect<void, FsError> =>
  Effect.gen(function* () {
    const temp = `${target}.${suffix}`
    yield* writeText(temp, content)
    yield* move(temp, target)
  })

// Copy `from` to `to` only when `to` is absent; returns whether it seeded.
export const seedFile = (
  from: string,
  to: string,
): Effect.Effect<boolean, FsError> =>
  Effect.gen(function* () {
    const present = yield* exists(to)
    if (present) {
      return false
    }
    yield* copy(from, to)
    return true
  })
