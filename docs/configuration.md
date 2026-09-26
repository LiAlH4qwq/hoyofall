# Configuration

hoyofall is configured with a single YAML file. Start from
[`config.example.yaml`](../config.example.yaml) and copy it to `config.yaml`
(gitignored, so local subscription tokens stay out of version control).

Every option is documented below with its type and default. The generated JSON
Schema (`hoyofall --print-schema`, shipped at `share/hoyofall/schema.json`) is
the machine-readable source of truth; the NixOS module validates `settings`
against it at build time.

```yaml
groups:
  custom:
    auto-hk:
      type: urltest
      includeRegexes: ["/HK"]
convert:
  emitBuiltinOutbounds: false
  proxyNameFormat: "{sub}-{name}"
subscriptions:
  airport:
    urlEnv: AIRPORT_URL
    intervalSeconds: 3600
output:
  file:
    enabled: true
    mode: aggregate
    path: /run/hoyofall/fragment.json
```

## `groups` (instance-level, recommended)

Custom groups select members across all subscriptions by matching the
**subscription name** and the **entity name** separately. sing-box cannot match
`outbounds` by regex, so hoyofall resolves the regexes and typed `members` into
explicit tags. The final tag of an instance-level group is its id verbatim.

| Field | Type | Default | Description |
|---|---|---|---|
| `groups.custom.<id>` | object | `{}` | A custom group; `<id>` is the final outbound tag. |
| `.type` | `"selector"` \| `"urltest"` | `"selector"` | Group kind. |
| `.includeProxies` | boolean | `true` | Consider proxies. |
| `.includeNativeGroups` | boolean | `false` | Consider converted native groups. |
| `.includeCustomGroups` | boolean | `false` | Consider per-subscription custom groups and previously-defined instance groups. |
| `.includeSubRegexes` | regex string array | `[]` | Keep candidates from subscriptions whose `name` matches any regex; empty = all. |
| `.excludeSubRegexes` | regex string array | `[]` | Drop candidates from subscriptions whose `name` matches any regex. |
| `.includeRegexes` | regex string array | `[]` | Keep entity names matching any regex; empty = all. |
| `.excludeRegexes` | regex string array | `[]` | Drop entity names matching any regex. |
| `.members` | array of typed refs | `[]` | Exact members; see below. |
| `.includeDirect` | boolean | `false` | Append `direct`. |
| `.includeBlock` | boolean | `false` | Append `block`. |
| `.onEmpty` | `"skip"` \| `"fail"` | `"skip"` | Behaviour when no member matches. |
| `.default` | string \| null | `null` | `selector` default member name. |
| `.interruptExistConnections` | boolean | `false` | Maps to `interrupt_exist_connections`. |
| `.url` | string | `"http://www.gstatic.com/generate_204"` | `urltest` probe URL. |
| `.intervalSeconds` | integer > 0 | `300` | `urltest` interval. |
| `.tolerance` | integer | `50` | `urltest` tolerance (ms). |
| `.idleTimeoutSeconds` | integer > 0 | `1800` | `urltest` idle timeout. |

`.members` entries are tagged structs (exact matches, still subject to the
`includeSubRegexes` scope for subscription-derived members):

```yaml
members:
  - { type: proxy,       subscription: default, name: "🇭🇰 HK-01" }
  - { type: nativeGroup, subscription: default, name: "auto" }
  - { type: customGroup, name: auto-hk }   # another custom group id
```

## `convert` (instance-wide)

| Field | Type | Default | Description |
|---|---|---|---|
| `convert` | object | `{}` | Instance-wide conversion options. |
| `convert.emitBuiltinOutbounds` | boolean | `false` | Emit `direct`/`block` outbounds. Leave `false` when merging into a base config that already defines them. |
| `convert.proxyNameFormat` | string | `"{sub}-{name}"` | Template for final outbound tags. `{sub}` = subscription `name` (or `id`), `{name}` = original proxy/group name. |

## `subscriptions.<id>` (map, required, at least one)

The map key is the subscription id — it is also the default display name and the
`{sub}` value used in `proxyNameFormat`.

| Field | Type | Default | Description |
|---|---|---|---|
| `subscriptions.<id>.name` | non-empty string | the key | Display name used for `{sub}`. |
| `subscriptions.<id>.url` | non-empty string | — | Subscription URL. Exactly one of `url` / `urlEnv` is required. |
| `subscriptions.<id>.urlEnv` | non-empty string | — | Name of an environment variable holding the URL (keeps tokens out of files). |
| `subscriptions.<id>.intervalSeconds` | integer > 0 | `3600` | Refresh interval. |
| `subscriptions.<id>.userAgent` | string | unset | `User-Agent` header used when fetching. |
| `subscriptions.<id>.format` | `"auto"` \| `"clash"` \| `"base64"` | `"auto"` | Payload format; `auto` detects base64. |
| `subscriptions.<id>.onUnsupported` | `"skip"` \| `"fail"` | `"skip"` | Whether unsupported/unparsable items are skipped (with warnings) or fail the whole subscription. |
| `subscriptions.<id>.convert` | object | `{}` | Proxy filtering (below). |
| `subscriptions.<id>.groups` | object | `{}` | Advanced per-subscription groups (below). |

### `subscriptions.<id>.convert`

| Field | Type | Default | Description |
|---|---|---|---|
| `exclude` | regex string array | `[]` | Drop proxies whose original name matches any regex. |

### `subscriptions.<id>.groups` (advanced)

Per-subscription groups are for the rare cases where you want groups scoped to
one subscription. Most users should use instance-level `groups.custom` instead.
Matching uses this subscription's original names and ids; a custom group's final
tag is `proxyNameFormat` applied to its id (e.g. `{sub}-{id}`).
`includeSubRegexes` / `excludeSubRegexes` are rejected here (the scope is already
a single subscription).

| Field | Type | Default | Description |
|---|---|---|---|
| `groups.native.enable` | boolean | `false` | Convert the subscription's own `proxy-groups`. |
| `groups.native.includeRegexes` | regex string array | `[]` | Keep matching native group names; empty = all. |
| `groups.native.excludeRegexes` | regex string array | `[]` | Drop matching native group names. |
| `groups.native.fallback` | `"urltest"` \| `"skip"` | `"urltest"` | Mapping for mihomo `fallback` groups. |
| `groups.native.loadBalance` | `"selector"` \| `"urltest"` \| `"skip"` | `"selector"` | Mapping for mihomo `load-balance` groups. |
| `groups.custom.<id>` | object | `{}` | Same fields as instance-level `groups.custom.<id>` except the `*SubRegexes` fields, matched against this subscription's names/ids and tagged via `proxyNameFormat`. |

## `output` (optional; at least one of `file` / `http` must be enabled)

| Field | Type | Default | Description |
|---|---|---|---|
| `output.file` | object | `{ enabled: true, mode: "aggregate", path: "hoyofall.json", directory: ".", permissions: "0644", pretty: true }` | File output. |
| `output.file.enabled` | boolean | `true` | Enable file output. |
| `output.file.mode` | `"aggregate"` \| `"per-subscription"` \| `"both"` | `"aggregate"` | `aggregate` writes one merged `{ "outbounds": [...] }`; `per-subscription` writes `<directory>/<id>.json` for `sing-box -C`. |
| `output.file.path` | string | `"hoyofall.json"` | Output file path (used by `aggregate` / `both`). |
| `output.file.directory` | string | `"."` | Output directory (used by `per-subscription` / `both`). |
| `output.file.permissions` | octal string | `"0644"` | File mode for written fragments. |
| `output.file.pretty` | boolean | `true` | Pretty-print JSON with 2-space indent. |
| `output.http` | object | `{ enabled: false, listen: { host: "127.0.0.1", port: 9090 } }` | Optional HTTP endpoint. |
| `output.http.enabled` | boolean | `false` | Enable the HTTP server. |
| `output.http.listen.host` | string | `"127.0.0.1"` | Bind host. |
| `output.http.listen.port` | integer 1–65535 | `9090` | Bind port. |
