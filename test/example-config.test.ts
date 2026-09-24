import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { parse } from "yaml"
import { decodeConfig, resolveConfig, validateConfig } from "../src/config/load"

describe("config.example.yaml", () => {
  it("is a valid, resolvable configuration", () => {
    const raw = readFileSync("config.example.yaml", "utf8")
    const program = Effect.gen(function* () {
      const decoded = yield* decodeConfig(parse(raw), "config.example.yaml")
      const validated = yield* validateConfig(decoded)
      return yield* resolveConfig(validated)
    })
    const resolved = Effect.runSync(program)
    expect(resolved.subscriptions.length).toBeGreaterThan(0)
    expect(resolved.output.file.enabled).toBe(true)
  })
})
