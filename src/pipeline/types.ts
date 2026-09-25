import type { SubscriptionFragment } from "../convert/fragment"
import type { ConversionWarning } from "../errors"

export interface ReadyState {
  readonly _tag: "Ready"
  readonly conversion: SubscriptionFragment
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
