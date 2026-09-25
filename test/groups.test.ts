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
  it("selects proxies by includeRegex", () => {
    const result = convert(
      subscription("sub", {
        native: defaultNativeGroupOptions,
        custom: { hk: customGroup({ includeRegex: ["^HK"] }) },
      }),
      fixture,
    )
    const group = result.fragment.outbounds.find(
      (outbound) => outbound.tag === "sub-hk",
    )
    expect(group).toMatchObject({
      type: "selector",
      tag: "sub-hk",
      outbounds: ["sub-HK-1", "sub-HK-2"],
    })
  })

  it("honours excludeRegex and urltest options", () => {
    const result = convert(
      subscription("sub", {
        native: defaultNativeGroupOptions,
        custom: {
          all: customGroup({
            type: "urltest",
            excludeRegex: ["^US"],
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

  it("supports explicit members and direct/block", () => {
    const result = convert(
      subscription("sub", {
        native: defaultNativeGroupOptions,
        custom: {
          pick: customGroup({
            includeProxies: false,
            members: ["HK-1", "DIRECT"],
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
      outbounds: ["sub-HK-1", "direct", "block"],
    })
  })

  it("filters and maps native groups", () => {
    const result = convert(
      subscription("sub", {
        native: {
          ...defaultNativeGroupOptions,
          enable: true,
          includeRegex: ["^auto$"],
          fallback: "skip",
        },
        custom: {},
      }),
      fixture,
    )
    const tags = result.fragment.outbounds.map((outbound) => outbound.tag)
    expect(tags).toEqual(["sub-HK-1", "sub-HK-2", "sub-US-1", "sub-auto"])
  })

  it("warns and skips an empty custom group", () => {
    const result = convert(
      subscription("sub", {
        native: defaultNativeGroupOptions,
        custom: { none: customGroup({ includeRegex: ["^ZZZ"] }) },
      }),
      fixture,
    )
    expect(result.fragment.outbounds.map((outbound) => outbound.tag)).not.toContain(
      "sub-none",
    )
    expect(result.warnings.map((warning) => warning._tag)).toContain(
      "EmptyCustomGroupError",
    )
  })
})

describe("instance-level custom groups", () => {
  const instanceConfig = (
    custom: InstanceGroups["custom"],
    subOverrides: ReadonlyArray<ResolvedSubscription> = [],
    emitBuiltinOutbounds = false,
  ): ResolvedConfig => {
    const bookings = subOverrides.length > 0
      ? subOverrides
      : [
          subscription("a", noGroups),
          subscription("b", noGroups),
        ]
    return {
      subscriptions: bookings,
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
    }
  }

  it("matches across subscriptions with <sub>/<name> and uses the id as tag", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const b = convert(subscription("b", noGroups), fixture)
    const config = instanceConfig({
      hk: customGroup({ includeRegex: ["^a/HK-1$", "^b/HK-2$"] }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a, b]))
    const group = assembled.fragment.outbounds.find(
      (outbound) => outbound.tag === "hk",
    )
    expect(group).toMatchObject({
      type: "selector",
      tag: "hk",
      outbounds: ["a-HK-1", "b-HK-2"],
    })
  })

  it("includes builtins when requested", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const config = instanceConfig(
      { auto: customGroup({ includeRegex: ["^a/HK"] }) },
      [subscription("a", noGroups)],
      true,
    )
    const assembled = Effect.runSync(assembleFragment(config, [a]))
    expect(assembled.fragment.outbounds.slice(0, 2)).toEqual([
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" },
    ])
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
    const exit = Effect.runSyncExit(assembleFragment(config, [make("a"), make("b")]))
    expect(Exit.isFailure(exit)).toBe(true)
  })
})
