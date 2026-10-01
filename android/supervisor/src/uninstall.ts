import { Effect } from "effect"
import { note } from "./log"
import { killPid, pids } from "./process"
import { DATA } from "./paths"
import { SUPERVISOR_MATCH, serviceNames, stopService } from "./services"

// Uninstall cleanup (`supervisor.js uninstall`). User state under DATA is kept
// (it holds config and tokens); remove it by hand for a clean slate.
export const uninstall = (): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.all(
      serviceNames.map((name) =>
        stopService(name).pipe(Effect.zipRight(note(`${name}: stopped`))),
      ),
      { discard: true },
    )

    const supervisors = yield* pids(SUPERVISOR_MATCH)
    yield* Effect.all(
      supervisors.map((pid) =>
        note(`stopping supervisor (${pid})`).pipe(Effect.zipRight(killPid(pid))),
      ),
      { discard: true },
    )

    yield* note(`uninstalled; configuration left at ${DATA}`)
  })
