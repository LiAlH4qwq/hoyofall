import { it } from "@effect/vitest"
import { Duration, Effect, Fiber, Schedule, TestClock } from "effect"
import { describe, expect } from "vitest"
import { retrySchedule } from "../src/pipeline/state"
import type { SubscriptionState } from "../src/pipeline/types"

const failed: SubscriptionState = {
  _tag: "Failed",
  error: "boom",
  updatedAt: 0,
}

const ready: SubscriptionState = {
  _tag: "Ready",
  conversion: {
    subscriptionId: "a",
    subscriptionName: "sub",
    fragment: { outbounds: [] },
    warnings: [],
    proxies: [],
    nativeGroups: [],
    customGroups: [],
  },
  warnings: [],
  updatedAt: 0,
  lastError: undefined,
}

describe("retrySchedule", () => {
  it.effect("backs off on failure and waits the interval on success", () =>
    Effect.gen(function* () {
      const driver = yield* Schedule.driver(
        Schedule.delays(
          retrySchedule(3600, { baseSeconds: 5, maxSeconds: 300 }),
        ),
      )
      const fiber = yield* Effect.gen(function* () {
        const first = yield* driver.next(failed)
        const second = yield* driver.next(failed)
        const success = yield* driver.next(ready)
        const reset = yield* driver.next(failed)
        return [first, second, success, reset] as const
      }).pipe(Effect.fork)

      yield* TestClock.adjust(Duration.seconds(5))
      yield* TestClock.adjust(Duration.seconds(10))
      yield* TestClock.adjust(Duration.seconds(3600))
      yield* TestClock.adjust(Duration.seconds(60))

      const delays = yield* Fiber.join(fiber)
      expect(delays.map(Duration.toSeconds)).toEqual([5, 10, 3600, 10])
    }),
  )
})
