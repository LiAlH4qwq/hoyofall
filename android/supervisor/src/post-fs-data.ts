import { Effect } from "effect"
import { join } from "node:path"
import type { FsError } from "./errors"
import { chmodSafe, makeDirectory, seedFile } from "./files"
import { note } from "./log"
import {
  DATA,
  HOYOFALL_DIR,
  SINGBOX_DIR,
  dataPath,
  directories,
  modulePath,
} from "./paths"

// Early boot preparation (`supervisor.js post-fs-data`): create the state tree
// and seed default files on first boot. Keep this fast and side-effect-light.
export const postFsData = (): Effect.Effect<void, FsError> =>
  Effect.gen(function* () {
    yield* Effect.all(directories.map(makeDirectory), { discard: true })

    const seeds: ReadonlyArray<
      readonly [from: string, to: string, label: string]
    > = [
      [
        modulePath("config", "config.android.yaml"),
        join(HOYOFALL_DIR, "config.yaml"),
        "config",
      ],
      [
        modulePath("config", "hoyofall.env.example"),
        join(HOYOFALL_DIR, "hoyofall.env"),
        "token env",
      ],
      [
        modulePath("config", "android.conf.example"),
        dataPath("android.conf"),
        "module settings",
      ],
      [
        modulePath("config", "singbox.json"),
        join(SINGBOX_DIR, "config.json"),
        "sing-box config",
      ],
      [
        modulePath("config", "hoyofall.nix"),
        join(HOYOFALL_DIR, "config.nix"),
        "config source",
      ],
      [
        modulePath("config", "singbox.nix"),
        join(SINGBOX_DIR, "config.nix"),
        "sing-box config source",
      ],
    ]

    yield* Effect.all(
      seeds.map(([from, to, label]) =>
        seedFile(from, to).pipe(
          Effect.flatMap((created) =>
            created ? note(`seeded ${label} at ${to}`) : Effect.void,
          ),
        ),
      ),
      { discard: true },
    )

    yield* chmodSafe(DATA, 0o700)
    yield* note(`post-fs-data: prepared ${DATA}`)
  })
