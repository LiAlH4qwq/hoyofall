import { FileSystem } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { it, scoped } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import type { Output } from "../src/config/schema"
import { writeSnapshot } from "../src/output/file"
import { applyUpdate } from "../src/pipeline/state"
import type { CacheMap } from "../src/pipeline/types"

describe("applyUpdate", () => {
  it("keeps the last ready fragment on failure", () => {
    const ready: CacheMap = {
      a: {
        _tag: "Ready",
        fragment: { outbounds: [{ type: "direct", tag: "direct" }] },
        warnings: [],
        updatedAt: 1,
        lastError: undefined,
      },
    }
    const next = applyUpdate(ready, {
      id: "a",
      result: { _tag: "Failed", error: "boom", updatedAt: 2 },
    })
    const state = next["a"]
    expect(state?._tag).toBe("Ready")
    expect(
      state !== undefined && state._tag === "Ready" ? state.lastError : undefined,
    ).toBe("boom")
  })

  it("stores a failure when there is no previous fragment", () => {
    const next = applyUpdate({}, {
      id: "a",
      result: { _tag: "Failed", error: "boom", updatedAt: 2 },
    })
    expect(next["a"]?._tag).toBe("Failed")
  })
})

const baseOutput = (overrides: Partial<Output["file"]>): Output => ({
  file: {
    enabled: true,
    mode: "aggregate",
    directory: ".",
    path: "hoyofall.json",
    permissions: "0644",
    pretty: true,
    ...overrides,
  },
  http: { enabled: false, listen: { host: "127.0.0.1", port: 9090 } },
})

const cache: CacheMap = {
  a: {
    _tag: "Ready",
    fragment: {
      outbounds: [{ type: "direct", tag: "direct" }],
    },
    warnings: [],
    updatedAt: 0,
    lastError: undefined,
  },
}

describe("writeSnapshot", () => {
  scoped("writes an aggregate fragment atomically", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const path = `${dir}/fragment.json`
      yield* writeSnapshot(baseOutput({ path }), false, ["a"], cache)
      const raw = yield* fs.readFileString(path)
      const parsed = JSON.parse(raw) as {
        readonly outbounds: ReadonlyArray<unknown>
      }
      expect(parsed.outbounds).toEqual([{ type: "direct", tag: "direct" }])
    }).pipe(Effect.provide(NodeContext.layer)),
  )

  scoped("writes per-subscription files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      yield* writeSnapshot(
        baseOutput({ mode: "per-subscription", directory: dir }),
        false,
        ["a"],
        cache,
      )
      const raw = yield* fs.readFileString(`${dir}/a.json`)
      const parsed = JSON.parse(raw) as {
        readonly outbounds: ReadonlyArray<unknown>
      }
      expect(parsed.outbounds).toEqual([{ type: "direct", tag: "direct" }])
    }).pipe(Effect.provide(NodeContext.layer)),
  )

  scoped("prepends builtin outbounds when requested", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const path = `${dir}/fragment.json`
      yield* writeSnapshot(baseOutput({ path }), true, ["a"], cache)
      const raw = yield* fs.readFileString(path)
      const parsed = JSON.parse(raw) as {
        readonly outbounds: ReadonlyArray<unknown>
      }
      expect(parsed.outbounds).toEqual([
        { type: "direct", tag: "direct" },
        { type: "block", tag: "block" },
        { type: "direct", tag: "direct" },
      ])
    }).pipe(Effect.provide(NodeContext.layer)),
  )
})
