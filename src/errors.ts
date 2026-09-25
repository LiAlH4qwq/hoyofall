import { Data } from "effect"

export class UsageError extends Data.TaggedError("UsageError")<{
  readonly message: string
}> {}

export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly path: string
  readonly issues: ReadonlyArray<string>
}> {}

export class ConfigValidationError extends Data.TaggedError("ConfigValidationError")<{
  readonly issues: ReadonlyArray<string>
}> {}

export class FetchError extends Data.TaggedError("FetchError")<{
  readonly subscription: string
  readonly url: string
  readonly message: string
  readonly cause: unknown
}> {}

export class PayloadDecodeError extends Data.TaggedError("PayloadDecodeError")<{
  readonly subscription: string
  readonly issues: ReadonlyArray<string>
}> {}

export class UnsupportedProxyTypeError extends Data.TaggedError("UnsupportedProxyTypeError")<{
  readonly subscription: string
  readonly proxy: string
  readonly type: string
}> {}

export class ProxyDecodeError extends Data.TaggedError("ProxyDecodeError")<{
  readonly subscription: string
  readonly proxy: string
  readonly issues: ReadonlyArray<string>
}> {}

export class UnsupportedGroupTypeError extends Data.TaggedError("UnsupportedGroupTypeError")<{
  readonly subscription: string
  readonly group: string
  readonly type: string
}> {}

export class GroupDecodeError extends Data.TaggedError("GroupDecodeError")<{
  readonly subscription: string
  readonly group: string
  readonly issues: ReadonlyArray<string>
}> {}

export class MissingReferenceError extends Data.TaggedError("MissingReferenceError")<{
  readonly scope: string
  readonly group: string
  readonly reference: string
}> {}

export class EmptyCustomGroupError extends Data.TaggedError("EmptyCustomGroupError")<{
  readonly scope: string
  readonly group: string
}> {}

export class DuplicateTagError extends Data.TaggedError("DuplicateTagError")<{
  readonly tags: ReadonlyArray<string>
}> {}

export class StrictConversionError extends Data.TaggedError("StrictConversionError")<{
  readonly subscription: string
  readonly issues: ReadonlyArray<string>
}> {}

export class OutputWriteError extends Data.TaggedError("OutputWriteError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class NoOutputEnabledError extends Data.TaggedError("NoOutputEnabledError")<{
  readonly message: string
}> {}

export class HttpServerError extends Data.TaggedError("HttpServerError")<{
  readonly message: string
  readonly cause: unknown
}> {}

export type ConversionWarning =
  | UnsupportedProxyTypeError
  | UnsupportedGroupTypeError
  | ProxyDecodeError
  | GroupDecodeError
  | MissingReferenceError
  | EmptyCustomGroupError
