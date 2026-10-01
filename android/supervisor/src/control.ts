import { Effect } from "effect"
import { dirname } from "node:path"
import { ControlError, UsageError } from "./errors"
import type { CommandError, FsError } from "./errors"
import {
  commitAtomic,
  makeDirectory,
  readTextOption,
  remove,
  writeText,
} from "./files"
import { runCommand } from "./process"
import { renderSource } from "./render"
import {
  parseServiceName,
  serviceNames,
  serviceSpec,
  serviceStatus,
  stopService,
  type ServiceName,
  type ServiceSpec,
} from "./services"

// The control protocol used by the KernelSU WebUI (`ksu.exec`). `stdout` is the
// payload (compact JSON, or "ok"); diagnostics go to stderr and a failure exits
// non-zero. The action set and `HOYOFALL_CONFIG_B64` are the stable seam.

const print = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(text)
  })

const printJson = (value: unknown): Effect.Effect<void> =>
  print(`${JSON.stringify(value)}\n`)

const lastLines = (text: string, count: number): string =>
  text.split("\n").slice(-count).join("\n")

const requireService = (
  raw: string,
): Effect.Effect<ServiceName, UsageError> =>
  raw === ""
    ? Effect.fail(
        new UsageError({
          message: "this action needs a service: hoyofall | sing-box",
        }),
      )
    : parseServiceName(raw)

const decodeBase64 = (text: string): string =>
  Buffer.from(text, "base64").toString("utf8")

const readBase64Env = (
  action: string,
): Effect.Effect<string, ControlError> =>
  Effect.gen(function* () {
    const encoded = yield* Effect.sync(
      () => process.env.HOYOFALL_CONFIG_B64 ?? "",
    )
    if (encoded === "") {
      return yield* Effect.fail(
        new ControlError({
          message: `${action}: HOYOFALL_CONFIG_B64 is empty`,
        }),
      )
    }
    return decodeBase64(encoded)
  })

// Validate a candidate config with the service's own checker before it replaces
// the live file. No-op when the service has no standalone checker; the checker's
// diagnostics are folded into the error for the WebUI to show.
const validateConfig = (
  spec: ServiceSpec,
  content: string,
): Effect.Effect<void, ControlError | FsError | CommandError> =>
  spec.check.length === 0
    ? Effect.void
    : Effect.gen(function* () {
        const temp = `${spec.config}.tmp-check-${process.pid}`
        yield* writeText(temp, content)
        const result = yield* runCommand([...spec.check, temp])
        yield* remove(temp)
        if (result.code !== 0) {
          const detail =
            result.stderr.trim() === "" ? result.stdout : result.stderr
          return yield* Effect.fail(
            new ControlError({
              message: `config validation failed:\n${detail.trim()}`,
            }),
          )
        }
        return undefined
      })

const commitConfig = (
  target: string,
  content: string,
): Effect.Effect<void, FsError> =>
  commitAtomic(target, content, `tmp-${process.pid}`)

const renderStatus = (
  names: ReadonlyArray<ServiceName>,
  list: boolean,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const rows = yield* Effect.all(
      names.map((name) =>
        serviceStatus(name).pipe(Effect.map((status) => ({ name, status }))),
      ),
    )
    if (!list) {
      const first = rows[0]
      yield* printJson(first === undefined ? {} : first.status)
      return
    }
    yield* printJson(
      rows.map((row) => ({ service: row.name, ...row.status })),
    )
  })

export const control = (
  argv: ReadonlyArray<string>,
): Effect.Effect<void, ControlError | FsError | UsageError | CommandError> =>
  Effect.gen(function* () {
    const action = argv[0] ?? "status"
    const rawService = argv[1] ?? ""
    switch (action) {
      case "status": {
        if (rawService === "") {
          yield* renderStatus(serviceNames, true)
        } else {
          const name = yield* parseServiceName(rawService)
          yield* renderStatus([name], false)
        }
        return
      }
      case "start": {
        const name = yield* requireService(rawService)
        const spec = serviceSpec(name)
        yield* remove(spec.flag)
        yield* stopService(name)
        yield* serviceStatus(name).pipe(Effect.flatMap(printJson))
        return
      }
      case "stop": {
        const name = yield* requireService(rawService)
        const spec = serviceSpec(name)
        yield* makeDirectory(dirname(spec.flag))
        yield* writeText(spec.flag, "")
        yield* stopService(name)
        yield* serviceStatus(name).pipe(Effect.flatMap(printJson))
        return
      }
      case "restart": {
        const name = yield* requireService(rawService)
        yield* stopService(name)
        yield* serviceStatus(name).pipe(Effect.flatMap(printJson))
        return
      }
      case "config": {
        const name = yield* requireService(rawService)
        const spec = serviceSpec(name)
        const text = yield* readTextOption(spec.config)
        if (text !== null) {
          yield* print(text)
        }
        return
      }
      case "config-source": {
        const name = yield* requireService(rawService)
        const spec = serviceSpec(name)
        const text = yield* readTextOption(spec.source)
        if (text !== null) {
          yield* print(text)
        }
        return
      }
      case "render-config": {
        const name = yield* requireService(rawService)
        const spec = serviceSpec(name)
        const rendered = yield* renderSource(spec)
        yield* print(`${rendered}\n`)
        return
      }
      case "set-source": {
        const name = yield* requireService(rawService)
        const spec = serviceSpec(name)
        const text = yield* readBase64Env("set-source")
        // Save the source first so edits are never lost, then render + validate
        // before replacing the live config; a failure leaves it untouched.
        yield* commitConfig(spec.source, text)
        const rendered = yield* renderSource(spec)
        yield* validateConfig(spec, rendered)
        yield* commitConfig(spec.config, rendered)
        yield* print("ok\n")
        return
      }
      case "set-config": {
        const name = yield* requireService(rawService)
        const spec = serviceSpec(name)
        const text = yield* readBase64Env("set-config")
        yield* validateConfig(spec, text)
        yield* commitConfig(spec.config, text)
        yield* print("ok\n")
        return
      }
      case "log": {
        const name = yield* requireService(rawService)
        const spec = serviceSpec(name)
        const text = yield* readTextOption(spec.log)
        yield* print(text === null ? "" : `${lastLines(text, 300)}\n`)
        return
      }
      default: {
        return yield* Effect.fail(
          new UsageError({
            message: `unknown action (${action}): status|start|stop|restart|config|config-source|set-config|render-config|set-source|log`,
          }),
        )
      }
    }
  })
