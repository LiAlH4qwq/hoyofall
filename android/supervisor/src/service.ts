import { Effect } from "effect"
import { join } from "node:path"
import { UsageError } from "./errors"
import type { FsError, SettingsError } from "./errors"
import { copy, exists, makeDirectory } from "./files"
import { note } from "./log"
import { HOYOFALL_DIR, dataPath, directories, modulePath } from "./paths"
import { loadSettings } from "./settings"
import {
  restartOnFragmentChange,
  superviseService,
  watchAndInject,
} from "./supervise"
import { serviceNames } from "./services"

// The long-running supervisor entrypoint (`supervisor.js service`), started
// from service.sh at late_start. It seeds state, loads settings and token env,
// then keeps itself and its child fibers alive.
export const runService = (): Effect.Effect<
  never,
  FsError | SettingsError | UsageError
> =>
  Effect.gen(function* () {
    const node = modulePath("bin", "node")
    const index = modulePath("index.js")
    if (!(yield* exists(node))) {
      return yield* Effect.fail(
        new UsageError({ message: `${node} is missing; reinstall the module` }),
      )
    }
    if (!(yield* exists(index))) {
      return yield* Effect.fail(
        new UsageError({
          message: `${index} is missing; reinstall the module`,
        }),
      )
    }

    yield* Effect.all(directories.map(makeDirectory), { discard: true })

    const config = join(HOYOFALL_DIR, "config.yaml")
    if (!(yield* exists(config))) {
      yield* copy(modulePath("config", "config.android.yaml"), config)
      yield* note(`seeded default config at ${config}`)
    }

    const settings = yield* loadSettings(dataPath("android.conf"))

    if (settings.watch_singbox && settings.singbox_dir !== "") {
      yield* Effect.forkDaemon(
        watchAndInject(
          settings.out_file,
          settings.singbox_dir,
          settings.singbox_target,
          settings.singbox_reload,
          settings.watch_interval_seconds,
        ),
      )
      yield* note(`watching ${settings.out_file} -> ${settings.singbox_dir}`)
    }

    const singboxBin = modulePath("bin", "sing-box")
    if (settings.restart_singbox_on_change && (yield* exists(singboxBin))) {
      yield* Effect.forkDaemon(
        restartOnFragmentChange(
          settings.out_file,
          settings.watch_interval_seconds,
        ),
      )
      yield* note("will restart sing-box on fragment change")
    }

    yield* Effect.all(
      serviceNames.map((name) =>
        Effect.forkDaemon(
          superviseService(name, settings.restart_delay_seconds),
        ),
      ),
      { discard: true },
    )
    yield* note(`supervisors started; output ${settings.out_file}`)
    return yield* Effect.never
  })
