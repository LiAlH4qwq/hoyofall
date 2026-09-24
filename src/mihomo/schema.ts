import { Schema } from "effect"

const StringOrNumber = Schema.Union(Schema.String, Schema.Number, Schema.Boolean)

const WsOpts = Schema.Struct({
  path: Schema.optional(Schema.String),
  headers: Schema.optional(
    Schema.Record({ key: Schema.String, value: StringOrNumber }),
  ),
  "max-early-data": Schema.optional(Schema.Number),
  "early-data-header-name": Schema.optional(Schema.String),
  "v2ray-http-upgrade": Schema.optional(Schema.Boolean),
})

const GrpcOpts = Schema.Struct({
  "grpc-service-name": Schema.optional(Schema.String),
})

const H2Opts = Schema.Struct({
  host: Schema.optional(Schema.Array(Schema.String)),
  path: Schema.optional(Schema.String),
})

const HttpOpts = Schema.Struct({
  method: Schema.optional(Schema.String),
  path: Schema.optional(Schema.Array(Schema.String)),
  headers: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Array(StringOrNumber),
    }),
  ),
})

const RealityOpts = Schema.Struct({
  "public-key": Schema.optional(Schema.String),
  "short-id": Schema.optional(Schema.String),
})

const CommonProxy = {
  name: Schema.String,
  server: Schema.String,
  port: Schema.Number,
  udp: Schema.optional(Schema.Boolean),
  "skip-cert-verify": Schema.optional(Schema.Boolean),
  "client-fingerprint": Schema.optional(Schema.String),
  alpn: Schema.optional(Schema.Array(Schema.String)),
  network: Schema.optional(Schema.String),
  "ws-opts": Schema.optional(WsOpts),
  "grpc-opts": Schema.optional(GrpcOpts),
}

export const Ss = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("ss"),
  cipher: Schema.String,
  password: Schema.String,
  plugin: Schema.optional(Schema.String),
  "plugin-opts": Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  "udp-over-tcp": Schema.optional(Schema.Boolean),
})

export const Ssr = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("ssr"),
  cipher: Schema.String,
  password: Schema.String,
  protocol: Schema.String,
  obfs: Schema.String,
  "protocol-param": Schema.optional(Schema.String),
  "obfs-param": Schema.optional(Schema.String),
})

export const Vmess = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("vmess"),
  uuid: Schema.String,
  alterId: Schema.optional(Schema.Number),
  cipher: Schema.optional(Schema.String),
  tls: Schema.optional(Schema.Boolean),
  servername: Schema.optional(Schema.String),
  "h2-opts": Schema.optional(H2Opts),
  "http-opts": Schema.optional(HttpOpts),
})

export const Vless = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("vless"),
  uuid: Schema.String,
  flow: Schema.optional(Schema.String),
  tls: Schema.optional(Schema.Boolean),
  servername: Schema.optional(Schema.String),
  "reality-opts": Schema.optional(RealityOpts),
  "h2-opts": Schema.optional(H2Opts),
  "http-opts": Schema.optional(HttpOpts),
})

export const Trojan = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("trojan"),
  password: Schema.String,
  sni: Schema.optional(Schema.String),
})

export const Hysteria = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("hysteria"),
  "auth-str": Schema.optional(Schema.String),
  "auth_str": Schema.optional(Schema.String),
  obfs: Schema.optional(Schema.String),
  protocol: Schema.optional(Schema.String),
  up: Schema.optional(Schema.String),
  down: Schema.optional(Schema.String),
  sni: Schema.optional(Schema.String),
  "disable-sni": Schema.optional(Schema.Boolean),
  "recv-window": Schema.optional(Schema.Number),
})

export const Hysteria2 = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("hysteria2"),
  password: Schema.optional(Schema.String),
  obfs: Schema.optional(Schema.String),
  "obfs-password": Schema.optional(Schema.String),
  sni: Schema.optional(Schema.String),
  fingerprint: Schema.optional(Schema.String),
  up: Schema.optional(Schema.String),
  down: Schema.optional(Schema.String),
})

export const Tuic = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("tuic"),
  uuid: Schema.String,
  password: Schema.optional(Schema.String),
  "congestion-controller": Schema.optional(Schema.String),
  "udp-relay-mode": Schema.optional(Schema.String),
  sni: Schema.optional(Schema.String),
  "reduce-rtt": Schema.optional(Schema.Boolean),
})

export const Wireguard = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("wireguard"),
  "private-key": Schema.String,
  "public-key": Schema.String,
  "pre-shared-key": Schema.optional(Schema.String),
  ip: Schema.optional(Schema.String),
  ipv6: Schema.optional(Schema.String),
  reserved: Schema.optional(Schema.Array(Schema.Number)),
  mtu: Schema.optional(Schema.Number),
  "allowed-ips": Schema.optional(Schema.Array(Schema.String)),
})

export const Http = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("http"),
  username: Schema.optional(Schema.String),
  password: Schema.optional(Schema.String),
  tls: Schema.optional(Schema.Boolean),
  sni: Schema.optional(Schema.String),
})

export const Socks5 = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("socks5"),
  username: Schema.optional(Schema.String),
  password: Schema.optional(Schema.String),
  tls: Schema.optional(Schema.Boolean),
  sni: Schema.optional(Schema.String),
})

export const Anytls = Schema.Struct({
  ...CommonProxy,
  type: Schema.Literal("anytls"),
  password: Schema.String,
  sni: Schema.optional(Schema.String),
})

export type MihomoProxy =
  | Schema.Schema.Type<typeof Ss>
  | Schema.Schema.Type<typeof Vmess>
  | Schema.Schema.Type<typeof Vless>
  | Schema.Schema.Type<typeof Trojan>
  | Schema.Schema.Type<typeof Hysteria>
  | Schema.Schema.Type<typeof Hysteria2>
  | Schema.Schema.Type<typeof Tuic>
  | Schema.Schema.Type<typeof Wireguard>
  | Schema.Schema.Type<typeof Http>
  | Schema.Schema.Type<typeof Socks5>
  | Schema.Schema.Type<typeof Anytls>

export const ProxyHeader = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
})

const GroupCommon = {
  name: Schema.String,
  proxies: Schema.optional(Schema.Array(Schema.String)),
  url: Schema.optional(Schema.String),
  interval: Schema.optional(Schema.Number),
  tolerance: Schema.optional(Schema.Number),
  "lazy": Schema.optional(Schema.Boolean),
}

export const SelectGroup = Schema.Struct({
  ...GroupCommon,
  type: Schema.Literal("select"),
})

export const UrlTestGroup = Schema.Struct({
  ...GroupCommon,
  type: Schema.Literal("url-test"),
})

export const FallbackGroup = Schema.Struct({
  ...GroupCommon,
  type: Schema.Literal("fallback"),
})

export const LoadBalanceGroup = Schema.Struct({
  ...GroupCommon,
  type: Schema.Literal("load-balance"),
})

export type MihomoGroup =
  | Schema.Schema.Type<typeof SelectGroup>
  | Schema.Schema.Type<typeof UrlTestGroup>
  | Schema.Schema.Type<typeof FallbackGroup>
  | Schema.Schema.Type<typeof LoadBalanceGroup>

export const RawSubscription = Schema.Struct({
  proxies: Schema.optionalWith(Schema.Array(Schema.Unknown), {
    default: () => [] as ReadonlyArray<unknown>,
  }),
  "proxy-groups": Schema.optionalWith(Schema.Array(Schema.Unknown), {
    default: () => [] as ReadonlyArray<unknown>,
  }),
})
