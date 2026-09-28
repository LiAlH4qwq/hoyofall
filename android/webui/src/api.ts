import { Effect, Schema } from "effect"
import { exec } from "./ksu"

export const MODULE = "/data/adb/modules/hoyofall"
const CONTROL = `${MODULE}/control.nu`
const NU = `${MODULE}/bin/nu`

// `control.nu` shells out to pgrep/kill; make sure they resolve even if the
// WebUI exec passes a bare environment.
const BASE_ENV: Record<string, string> = {
  LD_LIBRARY_PATH: `${MODULE}/lib`,
  PATH: "/system/bin:/system/xbin:/data/adb/ksu/bin:/data/adb/magisk",
}

export type ServiceName = "hoyofall" | "sing-box"

export const ServiceStatus = Schema.Struct({
  enabled: Schema.Boolean,
  running: Schema.Boolean,
  supervisor: Schema.Boolean,
})
export type ServiceStatus = typeof ServiceStatus.Type

export const SERVICES: ReadonlyArray<ServiceName> = ["hoyofall", "sing-box"]

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause))

const parseJsonUnknown = (value: string): unknown => JSON.parse(value)

export const control = (
  args: string,
  env: Record<string, string> = {},
): Effect.Effect<string, Error> =>
  exec(`${NU} --no-config-file ${CONTROL} ${args}`, { ...BASE_ENV, ...env }).pipe(
    Effect.flatMap((result) =>
      result.errno === 0
        ? Effect.succeed(result.stdout)
        : Effect.fail(new Error(result.stderr.trim() || `control.nu exited ${result.errno}`)),
    ),
  )

const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  const binary = bytes.reduce(
    (acc, byte) => acc + String.fromCharCode(byte),
    "",
  )
  return btoa(binary)
}

export const status = (service: ServiceName): Effect.Effect<ServiceStatus, Error> =>
  control(`status ${service}`).pipe(
    Effect.flatMap((stdout) =>
      Effect.try({
        try: () => parseJsonUnknown(stdout),
        catch: toError,
      }).pipe(
        Effect.flatMap((parsed) =>
          Schema.decodeUnknown(ServiceStatus)(parsed).pipe(
            Effect.mapError(toError),
          ),
        ),
      ),
    ),
  )

export const start = (service: ServiceName) => control(`start ${service}`)
export const stop = (service: ServiceName) => control(`stop ${service}`)
export const restart = (service: ServiceName) => control(`restart ${service}`)
export const readConfig = (service: ServiceName) => control(`config ${service}`)
export const readLog = (service: ServiceName) => control(`log ${service}`)
export const writeConfig = (service: ServiceName, content: string) =>
  control(`set-config ${service}`, { HOYOFALL_CONFIG_B64: toBase64(content) })

export const toast = (message: string): void => {
  window.ksu?.toast?.(message)
}

export const run = <A>(effect: Effect.Effect<A, Error>): Promise<A> =>
  Effect.runPromise(effect)
