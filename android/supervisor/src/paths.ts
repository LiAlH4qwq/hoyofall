import { join } from "node:path"

// On-device layout. The module payload is code-only; user state lives under
// DATA. See docs/android.md.
export const MODULE = "/data/adb/modules/hoyofall"
export const DATA = "/data/adb/hoyofall"
export const HOYOFALL_DIR = join(DATA, "hoyofall")
export const SINGBOX_DIR = join(DATA, "sing-box")

export const modulePath = (...parts: ReadonlyArray<string>): string =>
  join(MODULE, ...parts)

export const dataPath = (...parts: ReadonlyArray<string>): string =>
  join(DATA, ...parts)

export const directories: ReadonlyArray<string> = [
  HOYOFALL_DIR,
  join(HOYOFALL_DIR, "out"),
  join(HOYOFALL_DIR, "log"),
  SINGBOX_DIR,
  join(SINGBOX_DIR, "cache"),
  join(SINGBOX_DIR, "log"),
]
