import type { MihomoProxy } from "../mihomo/schema"
import type {
  Outbound,
  SingboxTls,
  SingboxTransport,
} from "../singbox/schema"

type StringOrNumber = string | number | boolean

interface TlsInput {
  readonly enabled: boolean
  readonly serverName?: string | undefined
  readonly insecure?: boolean | undefined
  readonly alpn?: ReadonlyArray<string> | undefined
  readonly fingerprint?: string | undefined
  readonly reality?:
    | {
        readonly publicKey: string
        readonly shortId?: string | undefined
      }
    | undefined
}

export const buildTls = (input: TlsInput): SingboxTls | undefined =>
  input.enabled
    ? {
        enabled: true,
        server_name: input.serverName,
        insecure: input.insecure,
        alpn: input.alpn,
        utls: input.fingerprint
          ? { enabled: true, fingerprint: input.fingerprint }
          : undefined,
        reality: input.reality
          ? {
              enabled: true,
              public_key: input.reality.publicKey,
              short_id: input.reality.shortId,
            }
          : undefined,
      }
    : undefined

const normalizeHeaders = (
  headers: Record<string, StringOrNumber> | undefined,
): Record<string, string> | undefined =>
  headers === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key, String(value)]),
      )

interface TransportInputs {
  readonly network: string | undefined
  readonly ws:
    | {
        readonly path?: string | undefined
        readonly headers?: Record<string, StringOrNumber> | undefined
        readonly "max-early-data"?: number | undefined
        readonly "early-data-header-name"?: string | undefined
      }
    | undefined
  readonly grpc: { readonly "grpc-service-name"?: string | undefined } | undefined
  readonly h2:
    | { readonly host?: ReadonlyArray<string> | undefined; readonly path?: string | undefined }
    | undefined
  readonly http:
    | {
        readonly headers?: Record<string, ReadonlyArray<StringOrNumber>> | undefined
        readonly path?: ReadonlyArray<string> | undefined
      }
    | undefined
}

export const buildTransport = (
  input: TransportInputs,
): SingboxTransport | undefined => {
  switch (input.network) {
    case "ws":
      return {
        type: "ws",
        path: input.ws?.path,
        headers: normalizeHeaders(input.ws?.headers),
        max_early_data: input.ws?.["max-early-data"],
        early_data_header_name: input.ws?.["early-data-header-name"],
      }
    case "grpc":
      return {
        type: "grpc",
        service_name: input.grpc?.["grpc-service-name"],
      }
    case "h2":
      return { type: "http", host: input.h2?.host, path: input.h2?.path }
    case "http":
      return {
        type: "http",
        host: input.http?.headers?.Host?.map(String),
        path: input.http?.path?.[0],
      }
    default:
      return undefined
  }
}

const pluginOpts = (opts: Record<string, unknown> | undefined): string | undefined => {
  const entries = opts === undefined ? [] : Object.entries(opts)
  return entries.length === 0
    ? undefined
    : entries.map(([key, value]) => `${key}=${String(value)}`).join(";")
}

const toMbps = (value: string | undefined): number | undefined => {
  const match = value?.match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

export const convertProxy = (proxy: MihomoProxy, tag: string): Outbound => {
  switch (proxy.type) {
    case "ss":
      return {
        type: "shadowsocks",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        method: proxy.cipher,
        password: proxy.password,
        plugin: proxy.plugin,
        plugin_opts: pluginOpts(proxy["plugin-opts"]),
        udp_over_tcp: proxy["udp-over-tcp"] ? { enabled: true } : undefined,
      }
    case "vmess":
      return {
        type: "vmess",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        uuid: proxy.uuid,
        security: proxy.cipher ?? "auto",
        alter_id: proxy.alterId ?? 0,
        tls: buildTls({
          enabled: proxy.tls === true,
          serverName: proxy.servername,
          insecure: proxy["skip-cert-verify"],
          alpn: proxy.alpn,
          fingerprint: proxy["client-fingerprint"],
        }),
        transport: buildTransport({
          network: proxy.network,
          ws: proxy["ws-opts"],
          grpc: proxy["grpc-opts"],
          h2: proxy["h2-opts"],
          http: proxy["http-opts"],
        }),
      }
    case "vless": {
      const reality = proxy["reality-opts"]
      return {
        type: "vless",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        uuid: proxy.uuid,
        flow: proxy.flow,
        tls: buildTls({
          enabled: proxy.tls === true || reality !== undefined,
          serverName: proxy.servername,
          insecure: proxy["skip-cert-verify"],
          alpn: proxy.alpn,
          fingerprint: proxy["client-fingerprint"],
          reality:
            reality !== undefined && reality["public-key"] !== undefined
              ? { publicKey: reality["public-key"], shortId: reality["short-id"] }
              : undefined,
        }),
        transport: buildTransport({
          network: proxy.network,
          ws: proxy["ws-opts"],
          grpc: proxy["grpc-opts"],
          h2: proxy["h2-opts"],
          http: proxy["http-opts"],
        }),
      }
    }
    case "trojan":
      return {
        type: "trojan",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        password: proxy.password,
        tls: buildTls({
          enabled: true,
          serverName: proxy.sni,
          insecure: proxy["skip-cert-verify"],
          alpn: proxy.alpn,
          fingerprint: proxy["client-fingerprint"],
        }),
        transport: buildTransport({
          network: proxy.network,
          ws: proxy["ws-opts"],
          grpc: proxy["grpc-opts"],
          h2: undefined,
          http: undefined,
        }),
      }
    case "hysteria":
      return {
        type: "hysteria",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        auth_str: proxy["auth-str"] ?? proxy["auth_str"],
        obfs: proxy.obfs,
        protocol: proxy.protocol,
        up_mbps: toMbps(proxy.up),
        down_mbps: toMbps(proxy.down),
        tls: buildTls({
          enabled: true,
          serverName: proxy.sni,
          insecure: proxy["skip-cert-verify"],
          alpn: proxy.alpn,
        }),
      }
    case "hysteria2":
      return {
        type: "hysteria2",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        password: proxy.password,
        obfs:
          proxy.obfs !== undefined
            ? { type: proxy.obfs, password: proxy["obfs-password"] }
            : undefined,
        up_mbps: toMbps(proxy.up),
        down_mbps: toMbps(proxy.down),
        tls: buildTls({
          enabled: true,
          serverName: proxy.sni,
          insecure: proxy["skip-cert-verify"],
          alpn: proxy.alpn,
          fingerprint: proxy.fingerprint,
        }),
      }
    case "tuic":
      return {
        type: "tuic",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        uuid: proxy.uuid,
        password: proxy.password,
        congestion_control: proxy["congestion-controller"],
        udp_relay_mode: proxy["udp-relay-mode"],
        tls: buildTls({
          enabled: true,
          serverName: proxy.sni,
          insecure: proxy["skip-cert-verify"],
          alpn: proxy.alpn,
        }),
      }
    case "wireguard":
      return {
        type: "wireguard",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        private_key: proxy["private-key"],
        peer_public_key: proxy["public-key"],
        pre_shared_key: proxy["pre-shared-key"],
        local_address: [proxy.ip, proxy.ipv6].filter(
          (value): value is string => value !== undefined,
        ),
        mtu: proxy.mtu,
        reserved: proxy.reserved,
      }
    case "http":
      return {
        type: "http",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        username: proxy.username,
        password: proxy.password,
        tls: buildTls({
          enabled: proxy.tls === true,
          serverName: proxy.sni,
          insecure: proxy["skip-cert-verify"],
          alpn: proxy.alpn,
          fingerprint: proxy["client-fingerprint"],
        }),
      }
    case "socks5":
      return {
        type: "socks",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        version: "5",
        username: proxy.username,
        password: proxy.password,
        tls: buildTls({
          enabled: proxy.tls === true,
          serverName: proxy.sni,
          insecure: proxy["skip-cert-verify"],
          alpn: proxy.alpn,
          fingerprint: proxy["client-fingerprint"],
        }),
      }
    case "anytls":
      return {
        type: "anytls",
        tag,
        server: proxy.server,
        server_port: proxy.port,
        password: proxy.password,
        tls: buildTls({
          enabled: true,
          serverName: proxy.sni,
          insecure: proxy["skip-cert-verify"],
          alpn: proxy.alpn,
          fingerprint: proxy["client-fingerprint"],
        }),
      }
  }
}
