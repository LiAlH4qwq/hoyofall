# hoyofall

**English** · [简体中文](./README.CN.md)

A small, headless service that periodically fetches **mihomo** (Clash.Meta)
subscriptions and emits **sing-box** configuration fragments (`outbounds`) —
both on disk (for `sing-box` core) and, optionally, over HTTP.

Written in TypeScript with [Effect](https://effect.website/): strict,
functional, no `let`/`var`, no loops, and every failure lives in the typed
Effect error channel.

## Why a file output is required

`sing-box` core **cannot import configuration over HTTP**. Its CLI only reads
local files or a local directory:

- `-c/--config <path>` — a local file (or the literal `stdin`)
- `-C/--config-directory <dir>` — all top-level `*.json` files in a directory
- `sing-box merge <out> -c a.json -c b.json` — merge files into one

When multiple configs are merged, **objects are overridden by key and arrays are
appended**, so the `outbounds` array of a fragment is concatenated into the base
config. hoyofall therefore writes fragments to disk; the optional HTTP endpoint
is useful for sing-box GUI clients and debugging.

## Features

- Fetches any number of mihomo subscription URLs on independent intervals.
- Converts `proxies` into sing-box `outbounds`; `proxy-groups` are converted too
  when `includeGroups: true` (off by default).
- Renames final outbound tags (default `subname-proxyname`) and rewrites group
  references accordingly, so fragments from several subscriptions can be merged.
- File output (default `aggregate`, atomic `tmp` + `rename`), with optional
  `per-subscription` directory mode for `sing-box -C`.
- Optional per-instance HTTP endpoint.
- `skip`/`fail` handling for unsupported proxy/group types.
- Multi-instance is a **NixOS module** feature (one `hoyofall-<name>` service
  per instance). The program itself is single-instance and already handles many
  subscriptions.

## Supported conversions

Proxies: `ss`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`, `tuic`,
`wireguard`, `http`, `socks5`, `anytls`.

Groups (only when `includeGroups: true`): `select → selector`,
`url-test → urltest`, `fallback → urltest`, `load-balance → selector` (both
configurable).

Everything else is reported as a typed warning and skipped (or fails the whole
subscription with `onUnsupported: fail`).

## Configuration

Start from [`config.example.yaml`](./config.example.yaml) (copy it to
`config.yaml`, which is gitignored so local subscription tokens stay out of
version control). Every option is documented below with its default value; the
generated JSON Schema (`hoyofall --print-schema`, shipped at
`share/hoyofall/schema.json`) is the machine-readable source of truth.

```yaml
convert:
  emitBuiltinOutbounds: false
  proxyNameFormat: "{sub}-{name}"
subscriptions:
  - id: airport
    urlEnv: AIRPORT_URL
    intervalSeconds: 3600
    convert:
      includeGroups: false
output:
  file:
    enabled: true
    mode: aggregate
    path: /run/hoyofall/fragment.json
```

### `convert` (instance-wide)

| Field | Type | Default | Description |
|---|---|---|---|
| `convert` | object | `{}` | Instance-wide conversion options. |
| `convert.emitBuiltinOutbounds` | boolean | `false` | Emit `direct`/`block` outbounds. Leave `false` when merging into a base config that already defines them. |
| `convert.proxyNameFormat` | string | `"{sub}-{name}"` | Template for final outbound tags. `{sub}` = subscription `name` (or `id`), `{name}` = original proxy/group name. |

### `subscriptions[]` (required, at least one)

| Field | Type | Default | Description |
|---|---|---|---|
| `subscriptions[].id` | non-empty string | — (required) | Unique subscription id. |
| `subscriptions[].name` | non-empty string | the `id` | Display name used for `{sub}`. |
| `subscriptions[].url` | non-empty string | — | Subscription URL. Exactly one of `url` / `urlEnv` is required. |
| `subscriptions[].urlEnv` | non-empty string | — | Name of an environment variable holding the URL (keeps tokens out of files). |
| `subscriptions[].intervalSeconds` | integer > 0 | `3600` | Refresh interval. |
| `subscriptions[].userAgent` | string | unset | `User-Agent` header used when fetching. |
| `subscriptions[].format` | `"auto"` \| `"clash"` \| `"base64"` | `"auto"` | Payload format; `auto` detects base64. |
| `subscriptions[].onUnsupported` | `"skip"` \| `"fail"` | `"skip"` | Whether unsupported/unparsable items are skipped (with warnings) or fail the whole subscription. |
| `subscriptions[].convert` | object | `{}` | Per-subscription conversion options (below). |

### `subscriptions[].convert`

| Field | Type | Default | Description |
|---|---|---|---|
| `includeGroups` | boolean | `false` | Convert mihomo `proxy-groups` into sing-box `selector`/`urltest` outbounds. Off by default because provider groups are usually not useful. |
| `fallback` | `"urltest"` \| `"skip"` | `"urltest"` | Mapping for mihomo `fallback` groups. |
| `loadBalance` | `"selector"` \| `"urltest"` \| `"skip"` | `"selector"` | Mapping for mihomo `load-balance` groups. |
| `exclude` | array of regex strings | `[]` | Names matching any regex are dropped. |

### `output` (optional; at least one of `file` / `http` must be enabled)

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

## Usage

```bash
hoyofall --config /etc/hoyofall/config.yaml
hoyofall --config=/etc/hoyofall/config.yaml
hoyofall --print-schema   # print the configuration JSON Schema
hoyofall --help
hoyofall --version
```

HTTP endpoints (when `output.http.enabled`):

- `GET /` — instance metadata
- `GET /health`
- `GET /sub/:id` — `{ "outbounds": [...] }`
- `GET /sub/:id/raw` — the bare `outbounds` array

### Consuming the fragment with sing-box

```bash
# per-subscription mode
sing-box run -c base.json -C /run/hoyofall
# aggregate mode
sing-box run -c base.json -c /run/hoyofall/fragment.json
# or freeze it first
sing-box merge merged.json -c base.json -c /run/hoyofall/fragment.json
```

With `emitBuiltinOutbounds: false` the base config is expected to define the
`direct`/`block` outbounds (referenced by converted groups).

## Nix

```nix
{
  inputs.hoyofall.url = "github:you/hoyofall";

  # Option A: NixOS module (multi-instance, like services.cloudflared)
  # Each instance becomes a `hoyofall-<name>` systemd service.
  imports = [ inputs.hoyofall.nixosModules.default ];
  services.hoyofall.instances.default = {
    settings = {
      subscriptions = [
        { id = "airport"; urlEnv = "AIRPORT_URL"; intervalSeconds = 3600; }
      ];
      # output.file.path / directory default to
      # /run/hoyofall-default/hoyofall.json and /run/hoyofall-default
    };
    environmentFile = "/run/secrets/hoyofall-default.env";
  };

  # Option B: package + overlay
  # nixpkgs.overlays = [ inputs.hoyofall.overlays.default ];
  # environment.systemPackages = [ pkgs.hoyofall ];
}
```

The instance configuration is validated against `schema.json` with
`check-jsonschema` before the service is built.

For `settings`-based instances the module defaults `output.file.path` to
`/run/hoyofall-<name>/hoyofall.json` and `output.file.directory` to
`/run/hoyofall-<name>` — the instance's systemd `RuntimeDirectory`, which is
also its `WorkingDirectory` and the only writable path by default. Point output
elsewhere by setting `output.file.path` / `output.file.directory` explicitly and
adding the directory to `extraReadWritePaths`. When using `configFile`, the
module cannot inject these defaults, so set them yourself.

## Development

See [`AGENTS.md`](./AGENTS.md) for the full code-style rules (functional AST
rules, Effect conventions, boundary typing). In short: no imperative
constructs, convert into `Effect` at boundaries, no broad `Effect.catchAll`,
and never bypass the type system.

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint + scripts/check-ast.ts
pnpm test        # vitest
pnpm build       # rolldown bundle + JSON schema
pnpm dev --config config.yaml
```

`pnpm lint` also runs an AST-level checker (`scripts/check-ast.ts`, TypeScript
compiler API) that rejects, in `src/`, `test/` and `scripts/`:

`var` / `let` / `using`, `while` / `do` / `for` / `for-in` / `for-of` /
labels / `break` / `continue`, `try` / `catch`, `throw`, `async` / `await`,
`Promise.then` / `Promise.finally`, `++` / `--`, `delete`,
`Array.prototype.forEach`, mutating array methods (`push`, `pop`, `shift`,
`unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin`),
`Object.assign` / `defineProperty` / `setPrototypeOf` and
`Reflect.set` / `deleteProperty` / `defineProperty`, assignment to object or
array members, the `any` keyword, and `as unknown as` double assertions. Use
`const`, `Array.map` / `filter` / `reduce` / `flatMap`, `Effect.all`,
`Effect.try` / `Effect.tryPromise`, and typed errors instead.
