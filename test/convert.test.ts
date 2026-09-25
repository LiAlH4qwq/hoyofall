import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import { convertSubscription } from "../src/convert/fragment"
import { decodeSubscription } from "../src/mihomo/decode"
import type { ResolvedSubscription } from "../src/config/load"

const fixture = `
proxies:
  - name: "ss1"
    type: ss
    server: 1.2.3.4
    port: 8388
    cipher: aes-256-gcm
    password: pass
  - name: "vm1"
    type: vmess
    server: 2.2.2.2
    port: 443
    uuid: 11111111-1111-1111-1111-111111111111
    alterId: 0
    cipher: auto
    tls: true
    servername: example.com
    network: ws
    ws-opts:
      path: /path
      headers:
        Host: example.com
  - name: "snell1"
    type: snell
    server: 3.3.3.3
    port: 443
    psk: secret
proxy-groups:
  - name: "auto"
    type: url-test
    proxies: ["ss1", "vm1"]
    url: http://www.gstatic.com/generate_204
    interval: 300
  - name: "manual"
    type: select
    proxies: ["auto", "DIRECT"]
`

const nativeGroups = (
  enable: boolean,
): ResolvedSubscription["groups"] => ({
  native: {
    enable,
    includeRegexes: [],
    excludeRegexes: [],
    fallback: "urltest",
    loadBalance: "selector",
  },
  custom: {},
})

const subscription: ResolvedSubscription = {
  id: "airport",
  name: "sub",
  url: "https://example.com/sub",
  intervalSeconds: 3600,
  userAgent: undefined,
  format: "auto",
  onUnsupported: "skip",
  convert: {
    exclude: [],
  },
  groups: nativeGroups(true),
}

describe("convertSubscription", () => {
  it("renames proxies and groups and rewrites references", () => {
    const decoded = Effect.runSync(decodeSubscription("airport", fixture, "auto"))
    const result = Effect.runSync(
      convertSubscription(subscription, decoded, {
        emitBuiltinOutbounds: false,
        proxyNameFormat: "{sub}-{name}",
      }),
    )

    const tags = result.fragment.outbounds.map((outbound) => outbound.tag)
    expect(tags).toEqual([
      "sub-ss1",
      "sub-vm1",
      "sub-auto",
      "sub-manual",
    ])

    const manual = result.fragment.outbounds.find(
      (outbound) => outbound.tag === "sub-manual",
    )
    expect(manual).toEqual({
      type: "selector",
      tag: "sub-manual",
      outbounds: ["sub-auto", "direct"],
    })

    const ss = result.fragment.outbounds.find(
      (outbound) => outbound.tag === "sub-ss1",
    )
    expect(ss).toEqual({
      type: "shadowsocks",
      tag: "sub-ss1",
      server: "1.2.3.4",
      server_port: 8388,
      method: "aes-256-gcm",
      password: "pass",
      plugin: undefined,
      plugin_opts: undefined,
      udp_over_tcp: undefined,
    })
  })

  it("omits groups by default", () => {
    const decoded = Effect.runSync(decodeSubscription("airport", fixture, "auto"))
    const withoutGroups = { ...subscription, groups: nativeGroups(false) }
    const result = Effect.runSync(
      convertSubscription(withoutGroups, decoded, {
        emitBuiltinOutbounds: false,
        proxyNameFormat: "{sub}-{name}",
      }),
    )
    expect(result.fragment.outbounds.map((outbound) => outbound.tag)).toEqual([
      "sub-ss1",
      "sub-vm1",
    ])
  })

  it("collects a warning for unsupported proxy types", () => {
    const decoded = Effect.runSync(decodeSubscription("airport", fixture, "auto"))
    const result = Effect.runSync(
      convertSubscription(subscription, decoded, {
        emitBuiltinOutbounds: false,
        proxyNameFormat: "{sub}-{name}",
      }),
    )
    expect(result.warnings.map((warning) => warning._tag)).toContain(
      "UnsupportedProxyTypeError",
    )
  })

  it("fails in strict mode when there are warnings", () => {
    const decoded = Effect.runSync(decodeSubscription("airport", fixture, "auto"))
    const strict = { ...subscription, onUnsupported: "fail" as const }
    const exit = Effect.runSyncExit(
      convertSubscription(strict, decoded, {
        emitBuiltinOutbounds: false,
        proxyNameFormat: "{name}",
      }),
    )
    expect(exit._tag).toBe("Failure")
  })
})

describe("proxy type mapping", () => {
  it("maps vmess tls and ws transport", () => {
    const decoded = Effect.runSync(decodeSubscription("airport", fixture, "auto"))
    const result = Effect.runSync(
      convertSubscription(subscription, decoded, {
        emitBuiltinOutbounds: false,
        proxyNameFormat: "{sub}-{name}",
      }),
    )
    const vm = result.fragment.outbounds.find(
      (outbound) => outbound.tag === "sub-vm1",
    )
    expect(vm).toMatchObject({
      type: "vmess",
      server: "2.2.2.2",
      server_port: 443,
      alter_id: 0,
      security: "auto",
      tls: { enabled: true, server_name: "example.com" },
      transport: { type: "ws", path: "/path", headers: { Host: "example.com" } },
    })
  })
})
