import { spawnSync } from "node:child_process"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { decodeConfig, validateConfig } from "../src/config/load"

// Render a Nix source with the host tsnix (the dev shell provides it). The same
// command runs on device, so this is a golden check of the shipped templates.
const render = (path: string): unknown =>
  JSON.parse(
    String(
      spawnSync(
        "tsnix",
        ["eval", "-f", path, "--io", "local", "--format", "json"],
        { encoding: "utf8" },
      ).stdout,
    ),
  )

const available = spawnSync("tsnix", ["--help"], { stdio: "ignore" }).status === 0

describe("android Nix config sources", () => {
  it.skipIf(!available)("hoyofall.nix decodes and validates", () => {
    const value = render("android/module/config/hoyofall.nix")
    const program = Effect.gen(function* () {
      const decoded = yield* decodeConfig(value, "hoyofall.nix")
      return yield* validateConfig(decoded)
    })
    const config = Effect.runSync(program)
    expect(Object.keys(config.subscriptions)).toContain("default")
    expect(config.output.file.path).toBe(
      "/data/adb/hoyofall/hoyofall/out/fragment.json",
    )
  })

  it.skipIf(!available)("singbox.nix renders a valid sing-box config", () => {
    const value = render("android/module/config/singbox.nix")
    expect(value).toMatchObject({ route: { final: "direct" } })
  })
})
