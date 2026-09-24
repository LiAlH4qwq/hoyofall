import { Schema } from "effect"

export const SingboxTls = Schema.Struct({
  enabled: Schema.Boolean,
  server_name: Schema.optional(Schema.String),
  insecure: Schema.optional(Schema.Boolean),
  alpn: Schema.optional(Schema.Array(Schema.String)),
  utls: Schema.optional(
    Schema.Struct({
      enabled: Schema.Boolean,
      fingerprint: Schema.optional(Schema.String),
    }),
  ),
  reality: Schema.optional(
    Schema.Struct({
      enabled: Schema.Boolean,
      public_key: Schema.String,
      short_id: Schema.optional(Schema.String),
    }),
  ),
})
export type SingboxTls = typeof SingboxTls.Type

export const SingboxMultiplex = Schema.Struct({
  enabled: Schema.Boolean,
  protocol: Schema.optional(Schema.String),
  max_streams: Schema.optional(Schema.Number),
})
export type SingboxMultiplex = typeof SingboxMultiplex.Type

export const SingboxTransport = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("ws"),
    path: Schema.optional(Schema.String),
    headers: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.String }),
    ),
    max_early_data: Schema.optional(Schema.Number),
    early_data_header_name: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("grpc"),
    service_name: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("http"),
    host: Schema.optional(Schema.Array(Schema.String)),
    path: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("httpupgrade"),
    host: Schema.optional(Schema.String),
    path: Schema.optional(Schema.String),
  }),
)
export type SingboxTransport = typeof SingboxTransport.Type

const Direct = Schema.Struct({
  type: Schema.Literal("direct"),
  tag: Schema.String,
})

const Block = Schema.Struct({
  type: Schema.Literal("block"),
  tag: Schema.String,
})

const Shadowsocks = Schema.Struct({
  type: Schema.Literal("shadowsocks"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  method: Schema.String,
  password: Schema.String,
  plugin: Schema.optional(Schema.String),
  plugin_opts: Schema.optional(Schema.String),
  network: Schema.optional(Schema.String),
  udp_over_tcp: Schema.optional(
    Schema.Struct({
      enabled: Schema.Boolean,
      version: Schema.optional(Schema.Number),
    }),
  ),
})

const Vmess = Schema.Struct({
  type: Schema.Literal("vmess"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  uuid: Schema.String,
  security: Schema.optional(Schema.String),
  alter_id: Schema.optional(Schema.Number),
  tls: Schema.optional(SingboxTls),
  transport: Schema.optional(SingboxTransport),
  multiplex: Schema.optional(SingboxMultiplex),
})

const Vless = Schema.Struct({
  type: Schema.Literal("vless"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  uuid: Schema.String,
  flow: Schema.optional(Schema.String),
  packet_encoding: Schema.optional(Schema.String),
  tls: Schema.optional(SingboxTls),
  transport: Schema.optional(SingboxTransport),
  multiplex: Schema.optional(SingboxMultiplex),
})

const Trojan = Schema.Struct({
  type: Schema.Literal("trojan"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  password: Schema.String,
  tls: Schema.optional(SingboxTls),
  transport: Schema.optional(SingboxTransport),
  multiplex: Schema.optional(SingboxMultiplex),
})

const Hysteria = Schema.Struct({
  type: Schema.Literal("hysteria"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  auth_str: Schema.optional(Schema.String),
  obfs: Schema.optional(Schema.String),
  protocol: Schema.optional(Schema.String),
  up_mbps: Schema.optional(Schema.Number),
  down_mbps: Schema.optional(Schema.Number),
  tls: Schema.optional(SingboxTls),
})

const Hysteria2 = Schema.Struct({
  type: Schema.Literal("hysteria2"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  password: Schema.optional(Schema.String),
  obfs: Schema.optional(
    Schema.Struct({
      type: Schema.String,
      password: Schema.optional(Schema.String),
    }),
  ),
  up_mbps: Schema.optional(Schema.Number),
  down_mbps: Schema.optional(Schema.Number),
  tls: Schema.optional(SingboxTls),
})

const Tuic = Schema.Struct({
  type: Schema.Literal("tuic"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  uuid: Schema.String,
  password: Schema.optional(Schema.String),
  congestion_control: Schema.optional(Schema.String),
  udp_relay_mode: Schema.optional(Schema.String),
  tls: Schema.optional(SingboxTls),
})

const Wireguard = Schema.Struct({
  type: Schema.Literal("wireguard"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  private_key: Schema.String,
  peer_public_key: Schema.String,
  pre_shared_key: Schema.optional(Schema.String),
  local_address: Schema.Array(Schema.String),
  mtu: Schema.optional(Schema.Number),
  reserved: Schema.optional(Schema.Array(Schema.Number)),
})

const Http = Schema.Struct({
  type: Schema.Literal("http"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  username: Schema.optional(Schema.String),
  password: Schema.optional(Schema.String),
  tls: Schema.optional(SingboxTls),
})

const Socks = Schema.Struct({
  type: Schema.Literal("socks"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  version: Schema.optional(Schema.Literal("5")),
  username: Schema.optional(Schema.String),
  password: Schema.optional(Schema.String),
  tls: Schema.optional(SingboxTls),
})

const AnyTls = Schema.Struct({
  type: Schema.Literal("anytls"),
  tag: Schema.String,
  server: Schema.String,
  server_port: Schema.Number,
  password: Schema.String,
  tls: Schema.optional(SingboxTls),
})

const Selector = Schema.Struct({
  type: Schema.Literal("selector"),
  tag: Schema.String,
  outbounds: Schema.Array(Schema.String),
  default: Schema.optional(Schema.String),
  interrupt_exist_connections: Schema.optional(Schema.Boolean),
})

const UrlTest = Schema.Struct({
  type: Schema.Literal("urltest"),
  tag: Schema.String,
  outbounds: Schema.Array(Schema.String),
  url: Schema.optional(Schema.String),
  interval: Schema.optional(Schema.String),
  tolerance: Schema.optional(Schema.Number),
  idle_timeout: Schema.optional(Schema.String),
  interrupt_exist_connections: Schema.optional(Schema.Boolean),
})

export const Outbound = Schema.Union(
  Direct,
  Block,
  Shadowsocks,
  Vmess,
  Vless,
  Trojan,
  Hysteria,
  Hysteria2,
  Tuic,
  Wireguard,
  Http,
  Socks,
  AnyTls,
  Selector,
  UrlTest,
)
export type Outbound = typeof Outbound.Type

export const Fragment = Schema.Struct({
  outbounds: Schema.Array(Outbound),
})
export type Fragment = typeof Fragment.Type
