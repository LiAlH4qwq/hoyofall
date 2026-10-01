import { Effect, Schema } from "effect"
import { parse as parseToml } from "smol-toml"
import { SettingsError } from "./errors"
import type { FsError } from "./errors"
import { exists, readText } from "./files"
import { HOYOFALL_DIR } from "./paths"

// `/data/adb/hoyofall/android.conf` (TOML). Every field has a default, so a
// missing or partially written file works.
const SettingsSchema = Schema.Struct({
  watch_singbox: Schema.optionalWith(Schema.Boolean, { default: () => true }),
  singbox_dir: Schema.optionalWith(Schema.String, { default: () => "" }),
  singbox_target: Schema.optionalWith(Schema.String, {
    default: () => "hoyofall.json",
  }),
  singbox_reload: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => [],
  }),
  restart_singbox_on_change: Schema.optionalWith(Schema.Boolean, {
    default: () => true,
  }),
  watch_interval_seconds: Schema.optionalWith(Schema.Number, {
    default: () => 5,
  }),
  restart_delay_seconds: Schema.optionalWith(Schema.Number, {
    default: () => 5,
  }),
  out_file: Schema.optionalWith(Schema.String, {
    default: () => `${HOYOFALL_DIR}/out/fragment.json`,
  }),
})

export type Settings = Schema.Schema.Type<typeof SettingsSchema>

export const defaultSettings: Settings = Schema.decodeUnknownSync(
  SettingsSchema,
)({})

export const loadSettings = (
  path: string,
): Effect.Effect<Settings, SettingsError | FsError> =>
  Effect.gen(function* () {
    const present = yield* exists(path)
    if (!present) {
      return defaultSettings
    }
    const text = yield* readText(path)
    const raw = yield* Effect.try({
      try: (): unknown => parseToml(text),
      catch: (cause) => new SettingsError({ message: `invalid TOML`, path, cause }),
    })
    return yield* Schema.decodeUnknown(SettingsSchema)(raw).pipe(
      Effect.mapError(
        (cause) => new SettingsError({ message: `invalid settings`, path, cause }),
      ),
    )
  })
