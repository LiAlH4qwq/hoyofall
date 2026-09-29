import { Effect } from "effect"
import { UsageError } from "./errors"

export type Command =
  | { readonly _tag: "Help" }
  | { readonly _tag: "Version" }
  | { readonly _tag: "PrintSchema" }
  | { readonly _tag: "Check"; readonly configPath: string }
  | { readonly _tag: "Run"; readonly configPath: string }

export const findConfigPath = (
  argv: ReadonlyArray<string>,
): string | undefined => {
  const equals = argv.find((arg) => arg.startsWith("--config="))
  if (equals !== undefined) {
    return equals.slice("--config=".length)
  }
  const index = argv.findIndex((arg) => arg === "--config" || arg === "-c")
  return index >= 0 ? argv[index + 1] : undefined
}

export const parseCommand = (
  argv: ReadonlyArray<string>,
): Effect.Effect<Command, UsageError> => {
  if (argv.includes("--help") || argv.includes("-h")) {
    return Effect.succeed({ _tag: "Help" })
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    return Effect.succeed({ _tag: "Version" })
  }
  if (argv.includes("--print-schema")) {
    return Effect.succeed({ _tag: "PrintSchema" })
  }
  const configPath = findConfigPath(argv)
  return configPath === undefined || configPath.startsWith("-")
    ? Effect.fail(new UsageError({ message: "Missing required option: --config <path>." }))
    : Effect.succeed(
        argv.includes("--check")
          ? { _tag: "Check" as const, configPath }
          : { _tag: "Run" as const, configPath },
      )
}
