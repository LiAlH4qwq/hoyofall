import {
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
  UsageError,
} from "./errors"

export { version } from "./version"

export const usage = `hoyofall - convert mihomo (Clash.Meta) subscriptions into sing-box outbound fragments

Usage:
  hoyofall --config <path>     run using the given configuration file
  hoyofall --check --config <path>
                               validate the configuration and exit
  hoyofall --print-schema      print the configuration JSON Schema and exit
  hoyofall --help              show this help and exit

Options:
  -c, --config <path>   path to a YAML configuration file (also --config=<path>)
      --check           validate the configuration and exit (needs --config)
      --print-schema    print the configuration JSON Schema and exit
  -h, --help            show this help and exit
  -v, --version         print the version and exit
`

const bullet = (items: ReadonlyArray<string>): string =>
  items.map((issue) => `  - ${issue}`).join("\n")

const causeMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

// `instanceof` keeps the dispatch type-safe: the `Data.TaggedError` classes are
// real classes, and an unrecognised value falls through to the generic case.
export const formatDiagnostic = (error: unknown): string => {
  if (error instanceof UsageError) {
    return `${error.message}\n\n${usage}`
  }
  if (error instanceof ConfigReadError) {
    return `Cannot read the configuration file.\n  path: ${error.path}\n  cause: ${causeMessage(error.cause)}`
  }
  if (error instanceof ConfigParseError) {
    return [
      `The configuration file is not valid.`,
      `  path: ${error.path}`,
      bullet(error.issues),
    ].join("\n")
  }
  if (error instanceof ConfigValidationError) {
    return ["The configuration is invalid.", bullet(error.issues)].join("\n")
  }
  return error instanceof Error
    ? `Unexpected error: ${error.message}`
    : `Unexpected error: ${String(error)}`
}
