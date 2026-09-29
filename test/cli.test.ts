import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { parseCommand } from "../src/cli"

describe("parseCommand", () => {
  it("parses --check with --config", () => {
    expect(
      Effect.runSync(parseCommand(["--check", "--config", "/tmp/a.yaml"])),
    ).toEqual({ _tag: "Check", configPath: "/tmp/a.yaml" })
  })

  it("parses --check with --config=", () => {
    expect(
      Effect.runSync(parseCommand(["--config=/tmp/a.yaml", "--check"])),
    ).toEqual({ _tag: "Check", configPath: "/tmp/a.yaml" })
  })

  it("parses a plain run", () => {
    expect(Effect.runSync(parseCommand(["--config", "/tmp/a.yaml"]))).toEqual({
      _tag: "Run",
      configPath: "/tmp/a.yaml",
    })
  })

  it("requires --config for --check", () => {
    const exit = Effect.runSyncExit(parseCommand(["--check"]))
    expect(exit._tag).toBe("Failure")
  })

  it("handles --print-schema without a config", () => {
    expect(Effect.runSync(parseCommand(["--print-schema"]))).toEqual({
      _tag: "PrintSchema",
    })
  })
})
