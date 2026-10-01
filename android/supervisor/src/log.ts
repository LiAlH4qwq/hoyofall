import { Effect } from "effect"

// All supervisor diagnostics go to stderr as plain, prefixed lines (stdout is
// reserved for the control protocol's JSON payload).
export const note = (message: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stderr.write(`[hoyofall] ${message}\n`)
  })
