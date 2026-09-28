import { describe, expect, it } from "vitest"
import { Effect } from "effect"
import type { ResolvedSubscription } from "../src/config/load"
import { convertSubscription } from "../src/convert/fragment"
import { decodeSubscription } from "../src/mihomo/decode"

const subscription: ResolvedSubscription = {
  id: "airport",
  name: "sub",
  url: "https://example.com/sub",
  intervalSeconds: 3600,
  userAgent: undefined,
  format: "auto",
  onUnsupported: "skip",
  convert: { exclude: [] },
  groups: {
    native: {
      enable: false,
      includeRegexes: [],
      excludeRegexes: [],
      fallback: "urltest",
      loadBalance: "selector",
    },
    custom: {},
  },
}

const convertOne = (rawProxy: Record<string, unknown>) => {
  const decoded = Effect.runSync(
    decodeSubscription(
      "airport",
      JSON.stringify({ proxies: [rawProxy] }),
      "clash",
    ),
  )
  expect(decoded.proxies[0]?._tag).toBe("proxy")
  const result = Effect.runSync(
    convertSubscription(subscription, decoded, {
      emitBuiltinOutbounds: false,
      proxyNameFormat: "{name}",
    }),
  )
  const outbound = result.fragment.outbounds.find(
    (item) => item.tag === rawProxy.name,
  )
  expect(outbound).toBeDefined()
  return outbound
}

describe("proxy type mappings", () => {
  it("maps vless with reality and h2 transport", () => {
    const outbound = convertOne({
      name: "vless1",
      type: "vless",
      server: "1.1.1.1",
      port: 443,
      uuid: "11111111-1111-1111-1111-111111111111",
      tls: true,
      servername: "sni.example",
      network: "h2",
      "h2-opts": { host: ["h.example"], path: "/h2" },
      "reality-opts": { "public-key": "pubkey", "short-id": "abcd" },
    })
    expect(outbound).toMatchObject({
      type: "vless",
      tag: "vless1",
      server: "1.1.1.1",
      server_port: 443,
      uuid: "11111111-1111-1111-1111-111111111111",
      tls: {
        enabled: true,
        server_name: "sni.example",
        reality: { enabled: true, public_key: "pubkey", short_id: "abcd" },
      },
      transport: { type: "http", host: ["h.example"], path: "/h2" },
    })
  })

  it("maps trojan tls and ws transport", () => {
    const outbound = convertOne({
      name: "trojan1",
      type: "trojan",
      server: "2.2.2.2",
      port: 443,
      password: "secret",
      sni: "trojan.example",
      network: "ws",
      "ws-opts": { path: "/ws" },
    })
    expect(outbound).toMatchObject({
      type: "trojan",
      tag: "trojan1",
      password: "secret",
      tls: { enabled: true, server_name: "trojan.example" },
      transport: { type: "ws", path: "/ws" },
    })
  })

  it("maps hysteria", () => {
    const outbound = convertOne({
      name: "hy1",
      type: "hysteria",
      server: "3.3.3.3",
      port: 8443,
      "auth-str": "auth",
      obfs: "obfuscate",
      protocol: "udp",
      up: "100 Mbps",
      down: "200 Mbps",
      sni: "hy.example",
      alpn: ["h3"],
    })
    expect(outbound).toMatchObject({
      type: "hysteria",
      auth_str: "auth",
      obfs: "obfuscate",
      protocol: "udp",
      up_mbps: 100,
      down_mbps: 200,
      tls: { enabled: true, server_name: "hy.example", alpn: ["h3"] },
    })
  })

  it("maps hysteria2 with obfs", () => {
    const outbound = convertOne({
      name: "hy2",
      type: "hysteria2",
      server: "4.4.4.4",
      port: 443,
      password: "pw",
      obfs: "salamander",
      "obfs-password": "opw",
      sni: "hy2.example",
      fingerprint: "chrome",
    })
    expect(outbound).toMatchObject({
      type: "hysteria2",
      password: "pw",
      obfs: { type: "salamander", password: "opw" },
      tls: {
        enabled: true,
        server_name: "hy2.example",
        utls: { enabled: true, fingerprint: "chrome" },
      },
    })
  })

  it("maps tuic", () => {
    const outbound = convertOne({
      name: "tuic1",
      type: "tuic",
      server: "5.5.5.5",
      port: 443,
      uuid: "22222222-2222-2222-2222-222222222222",
      password: "pw",
      "congestion-controller": "bbr",
      "udp-relay-mode": "native",
      sni: "tuic.example",
    })
    expect(outbound).toMatchObject({
      type: "tuic",
      uuid: "22222222-2222-2222-2222-222222222222",
      password: "pw",
      congestion_control: "bbr",
      udp_relay_mode: "native",
      tls: { enabled: true, server_name: "tuic.example" },
    })
  })

  it("maps wireguard", () => {
    const outbound = convertOne({
      name: "wg1",
      type: "wireguard",
      server: "6.6.6.6",
      port: 51820,
      "private-key": "priv",
      "public-key": "pub",
      "pre-shared-key": "psk",
      ip: "10.0.0.2/32",
      ipv6: "fd00::2/128",
      mtu: 1420,
      reserved: [1, 2, 3],
    })
    expect(outbound).toMatchObject({
      type: "wireguard",
      private_key: "priv",
      peer_public_key: "pub",
      pre_shared_key: "psk",
      local_address: ["10.0.0.2/32", "fd00::2/128"],
      mtu: 1420,
      reserved: [1, 2, 3],
    })
  })

  it("maps http and socks5", () => {
    const http = convertOne({
      name: "http1",
      type: "http",
      server: "7.7.7.7",
      port: 8080,
      username: "user",
      password: "pass",
      tls: false,
    })
    expect(http).toMatchObject({
      type: "http",
      username: "user",
      password: "pass",
    })
    const socks = convertOne({
      name: "socks1",
      type: "socks5",
      server: "8.8.8.8",
      port: 1080,
      username: "user",
      password: "pass",
      tls: false,
    })
    expect(socks).toMatchObject({
      type: "socks",
      version: "5",
      username: "user",
      password: "pass",
    })
  })

  it("maps anytls", () => {
    const outbound = convertOne({
      name: "any1",
      type: "anytls",
      server: "9.9.9.9",
      port: 443,
      password: "pw",
      sni: "any.example",
    })
    expect(outbound).toMatchObject({
      type: "anytls",
      password: "pw",
      tls: { enabled: true, server_name: "any.example" },
    })
  })

  it("maps v2ray http upgrade from ws-opts", () => {
    const outbound = convertOne({
      name: "vm-upgrade",
      type: "vmess",
      server: "10.10.10.10",
      port: 443,
      uuid: "33333333-3333-3333-3333-333333333333",
      network: "ws",
      "ws-opts": {
        path: "/upgrade",
        "v2ray-http-upgrade": true,
        headers: { Host: "up.example" },
      },
    })
    expect(outbound).toMatchObject({
      type: "vmess",
      transport: {
        type: "httpupgrade",
        host: "up.example",
        path: "/upgrade",
      },
    })
  })

  it("maps an explicit httpupgrade network", () => {
    const outbound = convertOne({
      name: "vu",
      type: "vless",
      server: "11.11.11.11",
      port: 443,
      uuid: "44444444-4444-4444-4444-444444444444",
      network: "httpupgrade",
      "ws-opts": { path: "/u2", headers: { Host: "u2.example" } },
    })
    expect(outbound).toMatchObject({
      type: "vless",
      transport: { type: "httpupgrade", host: "u2.example", path: "/u2" },
    })
  })

  it("maps grpc transport", () => {
    const outbound = convertOne({
      name: "vm-grpc",
      type: "vmess",
      server: "12.12.12.12",
      port: 443,
      uuid: "55555555-5555-5555-5555-555555555555",
      network: "grpc",
      "grpc-opts": { "grpc-service-name": "my-service" },
    })
    expect(outbound).toMatchObject({
      type: "vmess",
      transport: { type: "grpc", service_name: "my-service" },
    })
  })

  it("maps http transport", () => {
    const outbound = convertOne({
      name: "vm-http",
      type: "vmess",
      server: "13.13.13.13",
      port: 80,
      uuid: "66666666-6666-6666-6666-666666666666",
      network: "http",
      "http-opts": {
        path: ["/download"],
        headers: { Host: ["cdn.example"] },
      },
    })
    expect(outbound).toMatchObject({
      type: "vmess",
      transport: { type: "http", host: ["cdn.example"], path: "/download" },
    })
  })
})
