import { FileSystem, Path } from "@effect/platform"
import { Effect } from "effect"
import type { FileOutput, Output } from "../config/schema"
import { OutputWriteError } from "../errors"
import { mergeFragments, withBuiltinOutbounds } from "../convert/fragment"
import type { Fragment } from "../singbox/schema"
import type { CacheMap } from "../pipeline/types"

const atomicWrite = (
  filePath: string,
  data: string,
  permissions: string,
): Effect.Effect<void, OutputWriteError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.makeDirectory(path.dirname(filePath), { recursive: true })
    const temporary = `${filePath}.tmp-${globalThis.crypto.randomUUID()}`
    yield* fs.writeFileString(temporary, data)
    yield* fs.chmod(temporary, Number.parseInt(permissions, 8))
    yield* fs.rename(temporary, filePath)
  }).pipe(
    Effect.mapError((cause) => new OutputWriteError({ path: filePath, cause })),
  )

const serialize = (fragment: Fragment, pretty: boolean): string =>
  JSON.stringify(fragment, null, pretty ? 2 : undefined)

const collect = (
  subscriptionIds: ReadonlyArray<string>,
  cache: CacheMap,
): ReadonlyArray<{ readonly id: string; readonly fragment: Fragment }> =>
  subscriptionIds.flatMap((id) => {
    const state = cache[id]
    return state !== undefined && state._tag === "Ready"
      ? [{ id, fragment: state.fragment }]
      : []
  })

export const writeSnapshot = (
  output: Output,
  emitBuiltinOutbounds: boolean,
  subscriptionIds: ReadonlyArray<string>,
  cache: CacheMap,
): Effect.Effect<void, OutputWriteError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const file: FileOutput = output.file
    if (!file.enabled) {
      return
    }
    const items = collect(subscriptionIds, cache)

    const aggregateWrites =
      file.mode === "aggregate" || file.mode === "both"
        ? [
            atomicWrite(
              file.path,
              serialize(
                withBuiltinOutbounds(
                  mergeFragments(items.map((item) => item.fragment)),
                  emitBuiltinOutbounds,
                ),
                file.pretty,
              ),
              file.permissions,
            ),
          ]
        : []

    const perSubscriptionWrites =
      file.mode === "per-subscription" || file.mode === "both"
        ? items.map((item) =>
            atomicWrite(
              `${file.directory}/${item.id}.json`,
              serialize(item.fragment, file.pretty),
              file.permissions,
            ),
          )
        : []

    yield* Effect.all(
      [...aggregateWrites, ...perSubscriptionWrites],
      { concurrency: "unbounded" },
    )
  })
