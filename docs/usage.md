# Usage

## CLI

```bash
hoyofall --config /etc/hoyofall/config.yaml
hoyofall --config=/etc/hoyofall/config.yaml
hoyofall --print-schema   # print the configuration JSON Schema
hoyofall --help
hoyofall --version
```

`--config` (or `-c`) is required to run. The process stays in the foreground and
refreshes subscriptions until it is stopped.

## HTTP endpoints

Enable them with `output.http.enabled = true`:

| Route | Response |
|---|---|
| `GET /` | Service metadata: subscription ids and output modes. |
| `GET /health` | `{ "status": "ok" }`. |
| `GET /outbounds` | Full assembled fragment (instance-level groups included) plus a `warnings` array. |
| `GET /sub/:id` | `{ "outbounds": [...] }` for one subscription. |
| `GET /sub/:id/raw` | The bare `outbounds` array for one subscription. |

The HTTP endpoint is intended for sing-box GUI clients and debugging: sing-box
core itself cannot import configuration over HTTP.

## Consuming the fragment with sing-box

`sing-box` reads local files (`-c`) or a directory (`-C`). When several configs
are merged, **objects override by key and arrays append**, so the fragment's
`outbounds` array is concatenated into the base config.

```bash
# per-subscription mode
sing-box run -c base.json -C /run/hoyofall
# aggregate mode
sing-box run -c base.json -c /run/hoyofall/fragment.json
# or freeze it first
sing-box merge merged.json -c base.json -c /run/hoyofall/fragment.json
```

With `convert.emitBuiltinOutbounds: false` (the default), the base config is
expected to define the `direct` / `block` outbounds referenced by converted
groups. Defining them twice makes sing-box fail.

### Choosing stable group tags

`route.final` (and other references) should point at a group that always exists.
Define an umbrella selector with `includeProxies: false` and
`includeCustomGroups: true`, then reference that id. Referencing a per-region
group that may be absent makes sing-box fail to start.

## Supported conversions

Proxies: `ss`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`, `tuic`,
`wireguard`, `http`, `socks5`, `anytls`.

Groups: built from `groups.custom` (instance-level, recommended) or
per-subscription `groups.custom`, by matching proxies/groups with regexes and
explicit keys (sing-box cannot match `outbounds` by regex). Native groups
(`groups.native.enable`) map `select → selector`, `url-test → urltest`,
`fallback → urltest`, `load-balance → selector` (configurable).

Everything else is reported as a typed warning and skipped (or fails the whole
subscription with `onUnsupported: fail`).
