import { FileSystem, Path } from "@effect/platform"
import { Effect } from "effect"
import type { ResolvedConfig } from "../config/load"
import type { FileOutput } from "../config/schema"
import { assembleFragment, warningMessage, withBuiltinOutbounds, type SubscriptionFragment } from "../convert/fragment"
import { OutputWriteError } from "../errors"
import type { DuplicateTagError, EmptyCustomGroupError } from "../errors"
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

const serialize = (fragment: { readonly outbounds: ReadonlyArray<unknown> }, pretty: boolean): string =>
  JSON.stringify(fragment, null, pretty ? 2 : undefined)

const collect = (
  config: ResolvedConfig,
  cache: CacheMap,
): ReadonlyArray<SubscriptionFragment> =>
  config.subscriptions.flatMap((subscription) => {
    const state = cache[subscription.id]
    return state !== undefined && state._tag === "Ready"
      ? [state.conversion]
      : []
  })

export const writeSnapshot = (
  config: ResolvedConfig,
  cache: CacheMap,
): Effect.Effect<
  void,
  OutputWriteError | DuplicateTagError | EmptyCustomGroupError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function* () {
    const file: FileOutput = config.output.file
    if (!file.enabled) {
      return
    }
    const conversions = collect(config, cache)
    const assembled = yield* assembleFragment(config, conversions)

    yield* Effect.all(
      assembled.warnings.map((warning) =>
        Effect.logWarning(`output: ${warningMessage(warning)}`),
      ),
    )

    const aggregateWrites =
      file.mode === "aggregate" || file.mode === "both"
        ? [
            atomicWrite(
              file.path,
              serialize(assembled.fragment, file.pretty),
              file.permissions,
            ),
          ]
        : []

    const perSubscriptionWrites =
      file.mode === "per-subscription" || file.mode === "both"
        ? conversions.map((conversion) =>
            atomicWrite(
              `${file.directory}/${conversion.subscriptionId}.json`,
              serialize(
                withBuiltinOutbounds(
                  conversion.fragment,
                  config.convert.emitBuiltinOutbounds,
                ),
                file.pretty,
              ),
              file.permissions,
            ),
          )
        : []

    yield* Effect.all(
      [...aggregateWrites, ...perSubscriptionWrites],
      { concurrency: "unbounded" },
    )
  })
