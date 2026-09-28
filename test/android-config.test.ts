import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { parse } from "yaml"
import { decodeConfig, validateConfig } from "../src/config/load"

describe("android/module/config/config.android.yaml", () => {
  it("decodes and validates without needing the token env var", () => {
    const raw = readFileSync("android/module/config/config.android.yaml", "utf8")
    const program = Effect.gen(function* () {
      const decoded = yield* decodeConfig(parse(raw), "config.android.yaml")
      return yield* validateConfig(decoded)
    })
    const config = Effect.runSync(program)
    expect(Object.keys(config.subscriptions)).toContain("default")
    expect(config.output.file.path).toBe("/data/adb/hoyofall/out/fragment.json")
  })
})
