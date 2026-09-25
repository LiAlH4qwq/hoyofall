import { Effect, Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import type { ResolvedConfig, ResolvedSubscription } from "../src/config/load"
import {
  CustomGroup,
  defaultNativeGroupOptions,
  type InstanceGroups,
  type SubscriptionGroups,
} from "../src/config/schema"
import {
  assembleFragment,
  convertSubscription,
  type SubscriptionFragment,
} from "../src/convert/fragment"
import { decodeSubscription } from "../src/mihomo/decode"

const fixture = `
proxies:
  - { name: "HK-1", type: ss, server: 1.1.1.1, port: 8388, cipher: aes-256-gcm, password: p }
  - { name: "HK-2", type: ss, server: 1.1.1.2, port: 8388, cipher: aes-256-gcm, password: p }
  - { name: "US-1", type: ss, server: 2.2.2.2, port: 8388, cipher: aes-256-gcm, password: p }
proxy-groups:
  - { name: "auto", type: url-test, proxies: ["HK-1", "HK-2"], url: "http://x", interval: 300 }
  - { name: "fallback", type: fallback, proxies: ["HK-1"] }
`

const customGroup = (input: unknown) =>
  Schema.decodeUnknownSync(CustomGroup)(input)

const subscription = (
  id: string,
  groups: SubscriptionGroups,
  exclude: ReadonlyArray<string> = [],
): ResolvedSubscription => ({
  id,
  name: id,
  url: "https://example.com/sub",
  intervalSeconds: 3600,
  userAgent: undefined,
  format: "auto",
  onUnsupported: "skip",
  convert: { exclude },
  groups,
})

const noGroups: SubscriptionGroups = {
  native: defaultNativeGroupOptions,
  custom: {},
}

const convertOptions = {
  emitBuiltinOutbounds: false,
  proxyNameFormat: "{sub}-{name}",
} as const

const convert = (
  sub: ResolvedSubscription,
  payload: string,
): SubscriptionFragment =>
  Effect.runSync(
    Effect.flatMap(decodeSubscription(sub.id, payload, "auto"), (decoded) =>
      convertSubscription(sub, decoded, convertOptions),
    ),
  )

describe("per-subscription custom groups", () => {
  it("selects proxies by includeRegexes", () => {
    const result = convert(
      subscription("sub", {
        native: defaultNativeGroupOptions,
        custom: { hk: customGroup({ includeRegexes: ["^HK"] }) },
      }),
      fixture,
    )
    expect(
      result.fragment.outbounds.find((outbound) => outbound.tag === "sub-hk"),
    ).toMatchObject({
      type: "selector",
      tag: "sub-hk",
      outbounds: ["sub-HK-1", "sub-HK-2"],
    })
  })

  it("honours excludeRegexes and urltest options", () => {
    const result = convert(
      subscription("sub", {
        native: defaultNativeGroupOptions,
        custom: {
          all: customGroup({
            type: "urltest",
            excludeRegexes: ["^US"],
            url: "http://test",
            intervalSeconds: 120,
            tolerance: 10,
          }),
        },
      }),
      fixture,
    )
    expect(
      result.fragment.outbounds.find((outbound) => outbound.tag === "sub-all"),
    ).toMatchObject({
      type: "urltest",
      outbounds: ["sub-HK-1", "sub-HK-2"],
      url: "http://test",
      interval: "120s",
      tolerance: 10,
      idle_timeout: "1800s",
    })
  })

  it("supports typed members and direct/block", () => {
    const result = convert(
      subscription("sub", {
        native: { ...defaultNativeGroupOptions, enable: true },
        custom: {
          pick: customGroup({
            includeProxies: false,
            members: [
              { type: "proxy", subscription: "sub", name: "HK-1" },
              { type: "nativeGroup", subscription: "sub", name: "auto" },
            ],
            includeDirect: true,
            includeBlock: true,
          }),
        },
      }),
      fixture,
    )
    expect(
      result.fragment.outbounds.find((outbound) => outbound.tag === "sub-pick"),
    ).toMatchObject({
      type: "selector",
      outbounds: ["sub-HK-1", "sub-auto", "direct", "block"],
    })
  })

  it("filters and maps native groups", () => {
    const result = convert(
      subscription("sub", {
        native: {
          ...defaultNativeGroupOptions,
          enable: true,
          includeRegexes: ["^auto$"],
          fallback: "skip",
        },
        custom: {},
      }),
      fixture,
    )
    expect(result.fragment.outbounds.map((outbound) => outbound.tag)).toEqual([
      "sub-HK-1",
      "sub-HK-2",
      "sub-US-1",
      "sub-auto",
    ])
  })

  it("warns and skips an empty custom group, listing candidates", () => {
    const result = convert(
      subscription("sub", {
        native: defaultNativeGroupOptions,
        custom: { none: customGroup({ includeRegexes: ["^ZZZ"] }) },
      }),
      fixture,
    )
    expect(result.fragment.outbounds.map((outbound) => outbound.tag)).not.toContain(
      "sub-none",
    )
    const warning = result.warnings.find(
      (candidate) => candidate._tag === "EmptyCustomGroupError",
    )
    expect(warning).toMatchObject({
      _tag: "EmptyCustomGroupError",
      samples: ["HK-1", "HK-2", "US-1"],
    })
  })
})

describe("instance-level custom groups", () => {
  const instanceConfig = (
    custom: InstanceGroups["custom"],
    subscriptions: ReadonlyArray<ResolvedSubscription> = [
      subscription("a", noGroups),
      subscription("b", noGroups),
    ],
    emitBuiltinOutbounds = false,
  ): ResolvedConfig => ({
    subscriptions,
    convert: { emitBuiltinOutbounds, proxyNameFormat: "{sub}-{name}" },
    groups: { custom },
    output: {
      file: {
        enabled: true,
        mode: "aggregate",
        directory: ".",
        path: "hoyofall.json",
        permissions: "0644",
        pretty: true,
      },
      http: { enabled: false, listen: { host: "127.0.0.1", port: 9090 } },
    },
  })

  it("matches across subscriptions by proxy name", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const b = convert(subscription("b", noGroups), fixture)
    const config = instanceConfig({
      hk: customGroup({ includeRegexes: ["HK-1", "HK-2"] }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a, b]))
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "hk"),
    ).toMatchObject({
      type: "selector",
      tag: "hk",
      outbounds: ["a-HK-1", "a-HK-2", "b-HK-1", "b-HK-2"],
    })
  })

  it("filters by subscription with includeSubRegexes", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const b = convert(subscription("b", noGroups), fixture)
    const config = instanceConfig({
      hk: customGroup({
        includeSubRegexes: ["^a$"],
        includeRegexes: ["^HK"],
      }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a, b]))
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "hk"),
    ).toMatchObject({ outbounds: ["a-HK-1", "a-HK-2"] })
  })

  it("resolves typed members across subscriptions", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const b = convert(subscription("b", noGroups), fixture)
    const config = instanceConfig({
      pick: customGroup({
        includeProxies: false,
        members: [
          { type: "proxy", subscription: "a", name: "HK-1" },
          { type: "proxy", subscription: "b", name: "US-1" },
        ],
      }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a, b]))
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "pick"),
    ).toMatchObject({ outbounds: ["a-HK-1", "b-US-1"] })
  })

  it("resolves custom-group references regardless of definition order", () => {
    const a = convert(subscription("a", noGroups), fixture)
    // `default` is defined before the group it references, as Nix attribute
    // sets are sorted alphabetically.
    const config = instanceConfig({
      default: customGroup({
        includeProxies: false,
        includeCustomGroups: true,
        includeDirect: true,
      }),
      hk: customGroup({ includeRegexes: ["^HK"] }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a]))
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "default"),
    ).toMatchObject({ type: "selector", outbounds: ["hk", "direct"] })
  })

  it("does not reference empty custom groups from later groups", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const config = instanceConfig({
      "hk-auto": customGroup({ includeRegexes: ["^ZZZ"] }), // matches nothing
      proxy: customGroup({
        includeProxies: false,
        includeCustomGroups: true,
        includeDirect: true,
      }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a]))
    expect(assembled.fragment.outbounds.map((outbound) => outbound.tag)).not.toContain(
      "hk-auto",
    )
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "proxy"),
    ).toMatchObject({ type: "selector", outbounds: ["direct"] })
  })

  it("includes builtins when requested", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const config = instanceConfig(
      { auto: customGroup({ includeRegexes: ["^HK"] }) },
      [subscription("a", noGroups)],
      true,
    )
    const assembled = Effect.runSync(assembleFragment(config, [a]))
    expect(
      assembled.fragment.outbounds.map((outbound) => outbound.tag).slice(0, 3),
    ).toEqual(["auto", "direct", "block"])
  })

  it("fails on duplicate final tags", () => {
    const withoutPrefix = {
      emitBuiltinOutbounds: false,
      proxyNameFormat: "{name}",
    } as const
    const make = (id: string) =>
      Effect.runSync(
        Effect.flatMap(decodeSubscription(id, fixture, "auto"), (decoded) =>
          convertSubscription(subscription(id, noGroups), decoded, withoutPrefix),
        ),
      )
    const config = instanceConfig({})
    const exit = Effect.runSyncExit(
      assembleFragment(config, [make("a"), make("b")]),
    )
    expect(Exit.isFailure(exit)).toBe(true)
  })
})
