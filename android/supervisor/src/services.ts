import { Effect, Match, Schema } from "effect"
import { join } from "node:path"
import { UsageError } from "./errors"
import { exists } from "./files"
import { HOYOFALL_DIR, SINGBOX_DIR, modulePath } from "./paths"
import { killPid, pids } from "./process"

export const ServiceNameSchema = Schema.Literal("hoyofall", "sing-box")
export type ServiceName = Schema.Schema.Type<typeof ServiceNameSchema>

// A service is a supervised long-running process: its binary and arguments, the
// config file it reads (and whose source document the WebUI edits), the
// validator for a candidate config, its log, and a `flag` file whose presence
// means "stopped" (so the supervisor keeps running and `start` needs no reboot).
export interface ServiceSpec {
  readonly name: ServiceName
  readonly bin: string
  readonly args: ReadonlyArray<string>
  // `pgrep -f` pattern that identifies a running instance of the service.
  // hoyofall and the supervisor share bin/node, so matching the binary alone
  // would also match the supervisor; match the argv instead.
  readonly match: string
  readonly config: string
  // The Nix source document the WebUI edits; rendered on device by `tsnix`
  // (see render.ts) into `config`.
  readonly source: string
  readonly format: "yaml" | "json"
  readonly check: ReadonlyArray<string>
  readonly log: string
  readonly flag: string
  // The store-less Nix evaluator bundled at bin/tsnix.
  readonly tsnix: string
}

// The supervisor runs as `bin/node .../supervisor.js service`; the control
// invocation is `... control ...`, so this pattern does not self-match.
export const SUPERVISOR_MATCH = "supervisor.js service"

export const serviceNames: ReadonlyArray<ServiceName> = ["hoyofall", "sing-box"]

const hoyofallSpec: ServiceSpec = {
  name: "hoyofall",
  bin: modulePath("bin", "node"),
  args: [
    modulePath("index.js"),
    "--config",
    join(HOYOFALL_DIR, "config.yaml"),
  ],
  match: modulePath("index.js"),
  config: join(HOYOFALL_DIR, "config.yaml"),
  source: join(HOYOFALL_DIR, "config.nix"),
  format: "yaml",
  check: [modulePath("bin", "node"), modulePath("index.js"), "--check", "--config"],
  log: join(HOYOFALL_DIR, "log", "hoyofall.log"),
  flag: join(HOYOFALL_DIR, "disabled"),
  tsnix: modulePath("bin", "tsnix"),
}

const singboxSpec: ServiceSpec = {
  name: "sing-box",
  bin: modulePath("bin", "sing-box"),
  // `-D` is sing-box's working directory: its cache (cache.db, and any
  // Clash-API external UI it downloads) lands under sing-box/cache.
  args: [
    "run",
    "-c",
    join(SINGBOX_DIR, "config.json"),
    "-C",
    join(HOYOFALL_DIR, "out"),
    "-D",
    join(SINGBOX_DIR, "cache"),
  ],
  match: modulePath("bin", "sing-box"),
  config: join(SINGBOX_DIR, "config.json"),
  source: join(SINGBOX_DIR, "config.nix"),
  format: "json",
  // No standalone checker: sing-box reads its config merged with hoyofall's
  // fragment (`-C`), so a bare `check -c` reports missing outbounds.
  check: [],
  log: join(SINGBOX_DIR, "log", "sing-box.log"),
  flag: join(SINGBOX_DIR, "disabled"),
  tsnix: modulePath("bin", "tsnix"),
}

export const serviceSpec = (name: ServiceName): ServiceSpec =>
  Match.value(name).pipe(
    Match.when("hoyofall", () => hoyofallSpec),
    Match.when("sing-box", () => singboxSpec),
    Match.exhaustive,
  )

export const parseServiceName = (
  value: string,
): Effect.Effect<ServiceName, UsageError> =>
  Schema.decodeUnknown(ServiceNameSchema)(value).pipe(
    Effect.mapError(
      () =>
        new UsageError({
          message: `unknown service (${value}): hoyofall | sing-box`,
        }),
    ),
  )

export interface ServiceStatus {
  readonly enabled: boolean
  readonly running: boolean
  readonly supervisor: boolean
}

export const serviceStatus = (name: ServiceName): Effect.Effect<ServiceStatus> =>
  Effect.gen(function* () {
    const spec = serviceSpec(name)
    const enabled = !(yield* exists(spec.flag))
    const running = (yield* pids(spec.match)).length > 0
    const supervisor = (yield* pids(SUPERVISOR_MATCH)).length > 0
    return { enabled, running, supervisor }
  })

export const stopService = (name: ServiceName): Effect.Effect<void> =>
  Effect.gen(function* () {
    const spec = serviceSpec(name)
    const list = yield* pids(spec.match)
    yield* Effect.all(list.map(killPid), { discard: true })
  })
