import { Effect } from "effect"
import { stringify as toYaml } from "yaml"
import { ControlError } from "./errors"
import type { CommandError, FsError } from "./errors"
import { exists } from "./files"
import { runCommand } from "./process"
import type { ServiceSpec } from "./services"

// Render a service's Nix source document with the bundled store-less evaluator
// (`tsnix eval --io local --format json`) and serialise it to the service's
// config format. Nothing here touches a Nix store.

const parseJson = (text: string): Effect.Effect<unknown, ControlError> =>
  Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: () => new ControlError({ message: "tsnix produced invalid JSON" }),
  })

export const renderSource = (
  spec: ServiceSpec,
): Effect.Effect<string, ControlError | FsError | CommandError> =>
  Effect.gen(function* () {
    const present = yield* exists(spec.source)
    if (!present) {
      return yield* Effect.fail(
        new ControlError({ message: `no config source at ${spec.source}` }),
      )
    }
    const result = yield* runCommand([
      spec.tsnix,
      "eval",
      "-f",
      spec.source,
      "--io",
      "local",
      "--format",
      "json",
    ])
    if (result.code !== 0) {
      const detail =
        result.stderr.trim() === "" ? result.stdout : result.stderr
      return yield* Effect.fail(
        new ControlError({ message: `render failed:\n${detail.trim()}` }),
      )
    }
    const value = yield* parseJson(result.stdout)
    if (spec.format === "yaml") {
      return toYaml(value)
    }
    const rendered = JSON.stringify(value, null, 2)
    return rendered === undefined ? "" : rendered
  })
