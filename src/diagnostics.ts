import type {
  ConfigParseError,
  ConfigReadError,
  ConfigValidationError,
  UsageError,
} from "./errors"

export const version = "0.1.0"

export const usage = `hoyofall - convert mihomo (Clash.Meta) subscriptions into sing-box outbound fragments

Usage:
  hoyofall --config <path>     run using the given configuration file
  hoyofall --print-schema      print the configuration JSON Schema and exit
  hoyofall --help              show this help and exit

Options:
  -c, --config <path>   path to a YAML configuration file (also --config=<path>)
      --print-schema    print the configuration JSON Schema and exit
  -h, --help            show this help and exit
  -v, --version         print the version and exit
`

const bullet = (items: ReadonlyArray<string>): string =>
  items.map((issue) => `  - ${issue}`).join("\n")

const causeMessage = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause)

const tagOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "_tag" in error
    ? String((error as { readonly _tag: unknown })._tag)
    : undefined

export const formatDiagnostic = (error: unknown): string => {
  switch (tagOf(error)) {
    case "UsageError": {
      const usageError = error as UsageError
      return `${usageError.message}\n\n${usage}`
    }
    case "ConfigReadError": {
      const readError = error as ConfigReadError
      return `Cannot read the configuration file.\n  path: ${readError.path}\n  cause: ${causeMessage(readError.cause)}`
    }
    case "ConfigParseError": {
      const parseError = error as ConfigParseError
      return [
        `The configuration file is not valid.`,
        `  path: ${parseError.path}`,
        bullet(parseError.issues),
      ].join("\n")
    }
    case "ConfigValidationError": {
      const validationError = error as ConfigValidationError
      return [
        "The configuration is invalid.",
        bullet(validationError.issues),
      ].join("\n")
    }
    default:
      return error instanceof Error
        ? `Unexpected error: ${error.message}`
        : `Unexpected error: ${String(error)}`
  }
}
