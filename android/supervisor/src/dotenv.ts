import { Effect } from "effect"
import { HOYOFALL_DIR } from "./paths"
import type { FsError } from "./errors"
import { readTextOption } from "./files"

export type EnvRecord = { readonly [key: string]: string }

// A minimal `KEY=value` parser: blank lines and `#` comments are skipped, the
// first `=` splits the pair (so URLs with `=` survive). No quoting or escapes;
// the seeded file only ever holds a subscription URL.
export const parseDotenv = (text: string): EnvRecord =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=")
      return index === -1
        ? null
        : { key: line.slice(0, index), value: line.slice(index + 1) }
    })
    .filter((pair): pair is { readonly key: string; readonly value: string } =>
      pair !== null,
    )
    .reduce<EnvRecord>(
      (acc, pair) => ({ ...acc, [pair.key]: pair.value }),
      {},
    )

// Tokens live in `<HOYOFALL_DIR>/hoyofall.env`, never in config.yaml. Reloading
// before each spawn means editing the file and restarting the service takes
// effect without rebooting the module.
export const loadTokenEnv = (): Effect.Effect<EnvRecord, FsError> =>
  readTextOption(`${HOYOFALL_DIR}/hoyofall.env`).pipe(
    Effect.map((text) => (text === null ? {} : parseDotenv(text))),
  )
