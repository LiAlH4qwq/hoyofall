import { FileSystem } from "@effect/platform"
import { NodeContext } from "@effect/platform-node"
import { it, scoped } from "@effect/vitest"
import { Effect } from "effect"
import { describe, expect } from "vitest"
import type { ResolvedConfig, ResolvedSubscription } from "../src/config/load"
import type { Output } from "../src/config/schema"
import {
  defaultNativeGroupOptions,
  type ConvertOptions,
  type InstanceGroups,
} from "../src/config/schema"
import type { SubscriptionFragment } from "../src/convert/fragment"
import { writeSnapshot } from "../src/output/file"
import { applyUpdate } from "../src/pipeline/state"
import type { CacheMap } from "../src/pipeline/types"

describe("applyUpdate", () => {
  it("keeps the last ready fragment on failure", () => {
    const ready: CacheMap = {
      a: {
        _tag: "Ready",
        conversion: conversion(),
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

const nodeOutbound = {
  type: "shadowsocks" as const,
  tag: "sub-node",
  server: "1.1.1.1",
  server_port: 8388,
  method: "aes-256-gcm",
  password: "pass",
}

const conversion = (): SubscriptionFragment => ({
  subscriptionId: "a",
  subscriptionName: "sub",
  fragment: { outbounds: [nodeOutbound] },
  warnings: [],
  proxies: [{ original: "node", tag: "sub-node" }],
  nativeGroups: [],
  customGroups: [],
})

const subscription: ResolvedSubscription = {
  id: "a",
  name: "sub",
  url: "https://example.com/sub",
  intervalSeconds: 3600,
  userAgent: undefined,
  format: "auto",
  onUnsupported: "skip",
  convert: { exclude: [] },
  groups: { native: defaultNativeGroupOptions, custom: {} },
}

const makeConfig = (file: Partial<Output["file"]>): ResolvedConfig => {
  const convert: ConvertOptions = {
    emitBuiltinOutbounds: false,
    proxyNameFormat: "{sub}-{name}",
  }
  const groups: InstanceGroups = { custom: {} }
  return {
    subscriptions: [subscription],
    convert,
    groups,
    output: {
      file: {
        enabled: true,
        mode: "aggregate",
        directory: ".",
        path: "hoyofall.json",
        permissions: "0644",
        pretty: true,
        ...file,
      },
      http: { enabled: false, listen: { host: "127.0.0.1", port: 9090 } },
    },
  }
}

const cache = (): CacheMap => ({
  a: {
    _tag: "Ready",
    conversion: conversion(),
    warnings: [],
    updatedAt: 0,
    lastError: undefined,
  },
})

interface Serialized {
  readonly outbounds: ReadonlyArray<unknown>
}

describe("writeSnapshot", () => {
  scoped("writes an aggregate fragment atomically", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const path = `${dir}/fragment.json`
      yield* writeSnapshot(makeConfig({ path }), cache())
      const parsed = JSON.parse(
        yield* fs.readFileString(path),
      ) as Serialized
      expect(parsed.outbounds).toEqual([nodeOutbound])
    }).pipe(Effect.provide(NodeContext.layer)),
  )

  scoped("writes per-subscription files", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      yield* writeSnapshot(
        makeConfig({ mode: "per-subscription", directory: dir }),
        cache(),
      )
      const parsed = JSON.parse(
        yield* fs.readFileString(`${dir}/a.json`),
      ) as Serialized
      expect(parsed.outbounds).toEqual([nodeOutbound])
    }).pipe(Effect.provide(NodeContext.layer)),
  )

  scoped("prepends builtin outbounds when requested", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const dir = yield* fs.makeTempDirectoryScoped()
      const path = `${dir}/fragment.json`
      const config = makeConfig({ path })
      yield* writeSnapshot(
        {
          ...config,
          convert: { ...config.convert, emitBuiltinOutbounds: true },
        },
        cache(),
      )
      const parsed = JSON.parse(
        yield* fs.readFileString(path),
      ) as Serialized
      expect(parsed.outbounds).toEqual([
        { type: "direct", tag: "direct" },
        { type: "block", tag: "block" },
        nodeOutbound,
      ])
    }).pipe(Effect.provide(NodeContext.layer)),
  )
})
