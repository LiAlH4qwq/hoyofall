import { Either, JSONSchema, ParseResult, Schema } from "effect"
import { Config } from "../../../src/config/schema"

// The form structure and its validation both come from the one source of truth,
// the Effect `Config` schema the daemon uses.
export const formSchema = JSONSchema.make(Config)

export const validateConfig = (value: unknown): ReadonlyArray<string> => {
  const result = Schema.decodeUnknownEither(Config, { errors: "all" })(value)
  return Either.isLeft(result)
    ? ParseResult.ArrayFormatter.formatErrorSync(result.left).map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      )
    : []
}
