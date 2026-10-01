import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { parseDotenv } from "../android/supervisor/src/dotenv"
import { hashText } from "../android/supervisor/src/hash"
import {
  defaultSettings,
  loadSettings,
} from "../android/supervisor/src/settings"
import {
  parseServiceName,
  serviceNames,
  serviceSpec,
} from "../android/supervisor/src/services"

describe("supervisor dotenv", () => {
  it("parses KEY=value, skipping blanks and comments", () => {
    const parsed = parseDotenv("# comment\n\nA=1\nB=https://x/y?z=1\n")
    expect(parsed).toEqual({ A: "1", B: "https://x/y?z=1" })
  })
})

describe("supervisor hash", () => {
  it("is stable and input-sensitive", () => {
    expect(hashText("a")).toBe(hashText("a"))
    expect(hashText("a")).not.toBe(hashText("b"))
  })
})

describe("supervisor service specs", () => {
  it("covers every service with a distinct argv match", () => {
    expect(serviceNames.map((name) => serviceSpec(name).name)).toEqual([
      ...serviceNames,
    ])
    expect(serviceSpec("hoyofall").match).toContain("index.js")
    expect(serviceSpec("sing-box").match).toContain("sing-box")
  })

  it("rejects unknown service names with a UsageError", () => {
    const exit = Effect.runSyncExit(parseServiceName("nope"))
    expect(Exit.isFailure(exit)).toBe(true)
  })
})

describe("supervisor settings", () => {
  it("falls back to defaults when android.conf is absent", () => {
    const settings = Effect.runSync(loadSettings("/nonexistent/android.conf"))
    expect(settings.restart_singbox_on_change).toBe(true)
    expect(settings.singbox_target).toBe(defaultSettings.singbox_target)
  })

  it("decodes TOML and applies defaults for omitted fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "hoyofall-supervisor-"))
    const path = join(dir, "android.conf")
    writeFileSync(
      path,
      'singbox_dir = "/data/adb/box/conf"\nwatch_interval_seconds = 9\n',
    )
    const program = Effect.gen(function* () {
      const settings = yield* loadSettings(path)
      expect(settings.singbox_dir).toBe("/data/adb/box/conf")
      expect(settings.watch_interval_seconds).toBe(9)
      expect(settings.watch_singbox).toBe(true)
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => rmSync(dir, { recursive: true, force: true })),
      ),
    )
    return Effect.runPromise(program)
  })
})
