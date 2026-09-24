import type { ConversionWarning } from "../errors"
import type { Fragment } from "../singbox/schema"

export interface ReadyState {
  readonly _tag: "Ready"
  readonly fragment: Fragment
  readonly warnings: ReadonlyArray<ConversionWarning>
  readonly updatedAt: number
  readonly lastError: string | undefined
}

export interface FailedState {
  readonly _tag: "Failed"
  readonly error: string
  readonly updatedAt: number
}

export type SubscriptionState = ReadyState | FailedState

export type CacheMap = Readonly<Record<string, SubscriptionState>>
