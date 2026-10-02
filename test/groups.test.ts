import { Effect, Either, Exit, Schema } from "effect"
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

const customGroup = (input: Record<string, unknown>) =>
  Schema.decodeUnknownSync(CustomGroup)({ level: 1, ...input })

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

const convertEither = (sub: ResolvedSubscription, payload: string) =>
  Effect.runSync(
    Effect.either(
      Effect.flatMap(decodeSubscription(sub.id, payload, "auto"), (decoded) =>
        convertSubscription(sub, decoded, convertOptions),
      ),
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

  it("includes same-scope lower-level groups via includeLevels", () => {
    const result = convert(
      subscription("sub", {
        native: defaultNativeGroupOptions,
        custom: {
          hk: customGroup({ level: 1, includeRegexes: ["^HK"] }),
          us: customGroup({ level: 1, includeRegexes: ["^US"] }),
          all: customGroup({
            level: 2,
            includeProxies: false,
            includeLevels: [1],
          }),
        },
      }),
      fixture,
    )
    expect(
      result.fragment.outbounds.find((outbound) => outbound.tag === "sub-all"),
    ).toMatchObject({ type: "selector", outbounds: ["sub-hk", "sub-us"] })
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
    retry: { baseSeconds: 5, maxSeconds: 300 },
    groups: { custom },
    output: {
      file: {
        enabled: true,
        mode: "aggregate",
        directory: ".",
        path: "hoyofall.json",
        permissions: "0644",
        pretty: true,
        emitEmptyFragment: false,
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

  it("filters regex pools by subscription with includeSubRegexes", () => {
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

  it("lets explicit members bypass includeSubRegexes", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const b = convert(subscription("b", noGroups), fixture)
    const config = instanceConfig({
      pick: customGroup({
        includeProxies: false,
        includeSubRegexes: ["^a$"],
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

  it("lets explicit members bypass includeRegexes/excludeRegexes", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const config = instanceConfig({
      pick: customGroup({
        includeProxies: false,
        includeRegexes: ["^NOPE$"],
        excludeRegexes: ["HK"],
        includeSubRegexes: ["^nope$"],
        excludeSubRegexes: ["^a$"],
        members: [
          { type: "proxy", subscription: "a", name: "HK-1" },
          { type: "proxy", subscription: "a", name: "US-1" },
        ],
      }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a]))
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "pick"),
    ).toMatchObject({ outbounds: ["a-HK-1", "a-US-1"] })
  })

  it("lets explicit customGroup members bypass includeRegexes", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const config = instanceConfig({
      hk: customGroup({ level: 1, includeRegexes: ["^HK"] }),
      pick: customGroup({
        level: 2,
        includeProxies: false,
        includeRegexes: ["^NOPE$"],
        members: [{ type: "customGroup", name: "hk" }],
      }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a]))
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "pick"),
    ).toMatchObject({ outbounds: ["hk"] })
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
        level: 2,
        includeProxies: false,
        members: [{ type: "customGroup", name: "hk" }],
        includeDirect: true,
      }),
      hk: customGroup({ level: 1, includeRegexes: ["^HK"] }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a]))
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "default"),
    ).toMatchObject({ type: "selector", outbounds: ["hk", "direct"] })
  })

  it("builds a layered DAG with includeLevels", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const config = instanceConfig({
      "hk-auto": customGroup({ level: 1, includeRegexes: ["^HK"] }),
      "us-auto": customGroup({ level: 1, includeRegexes: ["^US"] }),
      usage: customGroup({
        level: 2,
        includeProxies: false,
        includeLevels: [1],
        includeDirect: true,
      }),
      global: customGroup({
        level: 3,
        includeProxies: false,
        includeLevels: [2],
        includeDirect: true,
      }),
    })
    const assembled = Effect.runSync(assembleFragment(config, [a]))
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "usage"),
    ).toMatchObject({ outbounds: ["hk-auto", "us-auto", "direct"] })
    expect(
      assembled.fragment.outbounds.find((outbound) => outbound.tag === "global"),
    ).toMatchObject({ outbounds: ["usage", "direct"] })
  })

  it("does not reference empty custom groups from later groups", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const config = instanceConfig({
      "hk-auto": customGroup({ level: 1, includeRegexes: ["^ZZZ"] }), // empty
      proxy: customGroup({
        level: 2,
        includeProxies: false,
        members: [{ type: "customGroup", name: "hk-auto" }],
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

  it("resolves a selector default to a typed member or a builtin", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const byMember = Effect.runSync(
      assembleFragment(
        instanceConfig({
          pick: customGroup({
            includeProxies: false,
            members: [{ type: "proxy", subscription: "a", name: "HK-1" }],
            includeDirect: true,
            default: "HK-1",
          }),
        }),
        [a],
      ),
    )
    expect(
      byMember.fragment.outbounds.find((outbound) => outbound.tag === "pick"),
    ).toMatchObject({ outbounds: ["a-HK-1", "direct"], default: "a-HK-1" })

    const byBuiltin = Effect.runSync(
      assembleFragment(
        instanceConfig({
          pick: customGroup({
            includeProxies: false,
            members: [{ type: "proxy", subscription: "a", name: "HK-1" }],
            includeDirect: true,
            default: "direct",
          }),
        }),
        [a],
      ),
    )
    expect(
      byBuiltin.fragment.outbounds.find((outbound) => outbound.tag === "pick"),
    ).toMatchObject({ outbounds: ["a-HK-1", "direct"], default: "direct" })
  })

  it("reports every failing empty group at once", () => {
    const a = convert(subscription("a", noGroups), fixture)
    const config = instanceConfig({
      one: customGroup({ includeRegexes: ["^ZZZ"], onEmpty: "fail" }),
      two: customGroup({ includeRegexes: ["^YYY"], onEmpty: "fail" }),
    })
    const either = Effect.runSync(Effect.either(assembleFragment(config, [a])))
    expect(Either.isLeft(either)).toBe(true)
    if (Either.isLeft(either)) {
      expect(either.left._tag).toBe("EmptyCustomGroupsError")
      expect(
        either.left._tag === "EmptyCustomGroupsError"
          ? either.left.groups.map((group) => group.group)
          : [],
      ).toEqual(["one", "two"])
    }
  })
})

describe("native group mappings", () => {
  const payload = `
proxies:
  - { name: "HK-1", type: ss, server: 1.1.1.1, port: 8388, cipher: aes-256-gcm, password: p }
  - { name: "HK-2", type: ss, server: 1.1.1.2, port: 8388, cipher: aes-256-gcm, password: p }
proxy-groups:
  - { name: "auto", type: url-test, proxies: ["HK-1", "HK-2"], url: "http://x", interval: 300, tolerance: 20 }
  - { name: "fb", type: fallback, proxies: ["HK-1"], url: "http://y" }
  - { name: "lb", type: load-balance, proxies: ["HK-1", "HK-2"], url: "http://z" }
`

  const native = (
    fallback: "urltest" | "skip",
    loadBalance: "selector" | "urltest" | "skip",
  ): SubscriptionGroups => ({
    native: { ...defaultNativeGroupOptions, enable: true, fallback, loadBalance },
    custom: {},
  })

  it("maps url-test, fallback and load-balance", () => {
    const result = convert(subscription("sub", native("urltest", "selector")), payload)
    expect(
      result.fragment.outbounds.find((outbound) => outbound.tag === "sub-auto"),
    ).toMatchObject({
      type: "urltest",
      url: "http://x",
      interval: "300s",
      tolerance: 20,
    })
    expect(
      result.fragment.outbounds.find((outbound) => outbound.tag === "sub-fb"),
    ).toMatchObject({ type: "urltest", url: "http://y" })
    expect(
      result.fragment.outbounds.find((outbound) => outbound.tag === "sub-lb"),
    ).toMatchObject({ type: "selector" })
  })

  it("honours skip and urltest mappings", () => {
    const skipped = convert(subscription("sub", native("skip", "skip")), payload)
    const tags = skipped.fragment.outbounds.map((outbound) => outbound.tag)
    expect(tags).not.toContain("sub-fb")
    expect(tags).not.toContain("sub-lb")

    const urltest = convert(subscription("sub", native("skip", "urltest")), payload)
    expect(
      urltest.fragment.outbounds.find((outbound) => outbound.tag === "sub-lb"),
    ).toMatchObject({ type: "urltest", url: "http://z" })
  })
})

describe("outbound DAG enforcement", () => {
  const native = {
    native: { ...defaultNativeGroupOptions, enable: true },
    custom: {},
  }

  it("rejects a self-referencing native group", () => {
    const payload = `
proxies:
  - { name: "P", type: ss, server: 1.1.1.1, port: 8388, cipher: aes-256-gcm, password: p }
proxy-groups:
  - { name: "self", type: select, proxies: ["self", "P"] }
`
    const either = convertEither(subscription("sub", native), payload)
    expect(Either.isLeft(either)).toBe(true)
    if (Either.isLeft(either)) {
      expect(either.left._tag).toBe("GroupCycleError")
    }
  })

  it("rejects a mutual native-group cycle", () => {
    const payload = `
proxies:
  - { name: "P", type: ss, server: 1.1.1.1, port: 8388, cipher: aes-256-gcm, password: p }
proxy-groups:
  - { name: "a", type: select, proxies: ["b", "P"] }
  - { name: "b", type: select, proxies: ["a", "P"] }
`
    const either = convertEither(subscription("sub", native), payload)
    expect(Either.isLeft(either)).toBe(true)
    if (Either.isLeft(either)) {
      expect(either.left._tag).toBe("GroupCycleError")
      expect(either.left._tag === "GroupCycleError" ? either.left.groups : []).toEqual(
        expect.arrayContaining(["sub-a", "sub-b"]),
      )
    }
  })
})
