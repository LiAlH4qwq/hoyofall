import { Data } from "effect"

// Every failure the supervisor can produce is a named, typed value. Keeping
// them as Data.TaggedError lets callers recover by tag (Effect.catchTag)
// instead of guessing at message strings.

export class FsError extends Data.TaggedError("FsError")<{
  readonly message: string
  readonly operation: string
  readonly path: string
  readonly cause: unknown
}> {}

export class SettingsError extends Data.TaggedError("SettingsError")<{
  readonly message: string
  readonly path: string
  readonly cause: unknown
}> {}

export class UsageError extends Data.TaggedError("UsageError")<{
  readonly message: string
}> {}

export class ControlError extends Data.TaggedError("ControlError")<{
  readonly message: string
}> {}

export class CommandError extends Data.TaggedError("CommandError")<{
  readonly message: string
  readonly command: string
}> {}

// A single, deliberate formatting boundary for the CLI: print a one-line
// message to stderr instead of an Effect pretty-printed defect report.
export const formatError = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "_tag" in error) {
    const tagged = error as { readonly _tag: string; readonly message?: string }
    return tagged.message ?? tagged._tag
  }
  return String(error)
}
