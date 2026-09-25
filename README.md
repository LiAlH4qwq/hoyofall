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
- Converts `proxies` into sing-box `outbounds`, and can build `selector`/`urltest`
  groups from regex/include/exclude rules (opt-in) or from the subscription's own
  `proxy-groups` (`groups.native`, off by default).
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

Groups: built from `groups.custom` (instance-level, recommended) or
per-subscription `groups.custom`, by matching proxies/groups with regexes and
explicit keys (sing-box cannot match `outbounds` by regex). Native groups
(`groups.native.enable`) map `select → selector`, `url-test → urltest`,
`fallback → urltest`, `load-balance → selector` (configurable).

Everything else is reported as a typed warning and skipped (or fails the whole
subscription with `onUnsupported: fail`).

## Configuration

Start from [`config.example.yaml`](./config.example.yaml) (copy it to
`config.yaml`, which is gitignored so local subscription tokens stay out of
version control). Every option is documented below with its default value; the
generated JSON Schema (`hoyofall --print-schema`, shipped at
`share/hoyofall/schema.json`) is the machine-readable source of truth.

```yaml
groups:
  custom:
    auto-hk:
      type: urltest
      includeRegex: ["/HK"]
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

### `groups` (instance-level, recommended)

Custom groups select members across all subscriptions. sing-box cannot match
`outbounds` by regex, so hoyofall resolves `includeRegex` / `excludeRegex` /
`members` into explicit tags. Candidate keys are `<sub>/<name>`, where `<sub>`
is the subscription `name` and `<name>` is the original proxy name, the original
native-group name, or a per-subscription custom group id. Instance-level groups
may also reference other instance-level groups by id. The final tag of an
instance-level group is its id verbatim.

| Field | Type | Default | Description |
|---|---|---|---|
| `groups.custom.<id>` | object | `{}` | A custom group; `<id>` is the final outbound tag. |
| `.type` | `"selector"` \| `"urltest"` | `"selector"` | Group kind. |
| `.includeProxies` | boolean | `true` | Consider proxies. |
| `.includeNativeGroups` | boolean | `false` | Consider converted native groups. |
| `.includeCustomGroups` | boolean | `false` | Consider per-subscription custom groups and other instance groups. |
| `.includeRegex` | regex string array | `[]` | Keep candidates matching any regex; empty = all. |
| `.excludeRegex` | regex string array | `[]` | Drop candidates matching any regex. |
| `.members` | string array | `[]` | Explicit keys to add (`<sub>/<name>`, group id, or `DIRECT`/`REJECT`). |
| `.includeDirect` | boolean | `false` | Append `direct`. |
| `.includeBlock` | boolean | `false` | Append `block`. |
| `.onEmpty` | `"skip"` \| `"fail"` | `"skip"` | Behaviour when no member matches. |
| `.default` | string \| null | `null` | `selector` default member (a key). |
| `.interruptExistConnections` | boolean | `false` | Maps to `interrupt_exist_connections`. |
| `.url` | string | `"http://www.gstatic.com/generate_204"` | `urltest` probe URL. |
| `.intervalSeconds` | integer > 0 | `300` | `urltest` interval. |
| `.tolerance` | integer | `50` | `urltest` tolerance (ms). |
| `.idleTimeoutSeconds` | integer > 0 | `1800` | `urltest` idle timeout. |

### `convert` (instance-wide)

| Field | Type | Default | Description |
|---|---|---|---|
| `convert` | object | `{}` | Instance-wide conversion options. |
| `convert.emitBuiltinOutbounds` | boolean | `false` | Emit `direct`/`block` outbounds. Leave `false` when merging into a base config that already defines them. |
| `convert.proxyNameFormat` | string | `"{sub}-{name}"` | Template for final outbound tags. `{sub}` = subscription `name` (or `id`), `{name}` = original proxy/group name. |

### `subscriptions.<id>` (map, required, at least one)

The map key is the subscription id — it is also the default display name and
the `{sub}` value used in `proxyNameFormat`.

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
Matching uses this subscription's original names and ids (no `<sub>/` prefix);
a custom group's final tag is `proxyNameFormat` applied to its id
(e.g. `{sub}-{id}`).

| Field | Type | Default | Description |
|---|---|---|---|
| `groups.native.enable` | boolean | `false` | Convert the subscription's own `proxy-groups`. |
| `groups.native.includeRegex` | regex string array | `[]` | Keep matching native group names; empty = all. |
| `groups.native.excludeRegex` | regex string array | `[]` | Drop matching native group names. |
| `groups.native.fallback` | `"urltest"` \| `"skip"` | `"urltest"` | Mapping for mihomo `fallback` groups. |
| `groups.native.loadBalance` | `"selector"` \| `"urltest"` \| `"skip"` | `"selector"` | Mapping for mihomo `load-balance` groups. |
| `groups.custom.<id>` | object | `{}` | Same fields as instance-level `groups.custom.<id>`, matched against this subscription's names/ids and tagged via `proxyNameFormat`. |


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
- `GET /outbounds` — the full assembled fragment (includes instance-level groups and a `warnings` array)
- `GET /sub/:id` — `{ "outbounds": [...] }` (that subscription only)
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
      subscriptions.airport = {
        urlEnv = "AIRPORT_URL";
        intervalSeconds = 3600;
      };
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

### Injecting the fragment into `services.sing-box`

The nixpkgs `services.sing-box` module runs
`sing-box -D $STATE_DIRECTORY -C $RUNTIME_DIRECTORY run`, where
`RuntimeDirectory = "sing-box"` (i.e. `/run/sing-box`) and `ExecStartPre` writes
your `settings` to `/run/sing-box/config.json`. `-C` reads **every** top-level
`*.json` in that directory and merges them — **objects are overridden by key and
arrays are appended** — so dropping the hoyofall fragment there appends its
`outbounds` to the ones from `settings`.

Because `services.sing-box.settings` is static Nix, reference the generated tags
by name (they are known at evaluation time), and keep the fragment's dynamic
parts as groups. sing-box reads the config only at startup, so a systemd path
unit re-injects and restarts it when hoyofall refreshes.

> `systemd.services.<name>.preStart` runs as the service `User` (`sing-box`), so
> it **cannot** read hoyofall's `0700` `RuntimeDirectory`. Injecting must be done
> by a root oneshot (no `User =`) ordered `Before=sing-box.service`.

```nix
{ config, pkgs, lib, ... }:
let
  fragment = "/run/hoyofall-default/hoyofall.json";   # hoyofall module default
  injected = "/run/sing-box/zz-hoyofall.json";
in
{
  # 1. hoyofall produces the fragment (see the module example above)
  services.hoyofall.instances.default = {
    settings = {
      convert.emitBuiltinOutbounds = false;   # base defines direct/block
      subscriptions.default = { name = "default"; urlEnv = "SUB_URL"; };
      groups.custom = {
        "hk-auto" = { type = "urltest"; includeRegex = [ "^default/🇭🇰" ]; };
        "us-auto" = { type = "urltest"; includeRegex = [ "^default/🇺🇸" ]; };
        # one stable umbrella tag for sing-box to reference via route.final
        proxy = { type = "selector"; includeCustomGroups = true; includeDirect = true; };
      };
    };
    environmentFile = "/run/secrets/hoyofall-default.env";
  };

  # 2. root oneshot injects the fragment before sing-box starts
  systemd.services.hoyofall-inject-singbox = {
    wants = [ "hoyofall-default.service" ];
    after = [ "hoyofall-default.service" ];
    before = [ "sing-box.service" ];
    requiredBy = [ "sing-box.service" ];
    serviceConfig = {
      Type = "oneshot";
      RemainAfterExit = true;
    };
    script = ''
      install -d -m 0700 -o sing-box -g sing-box /run/sing-box
      for _ in $(seq 1 120); do
        [ -f ${fragment} ] && break
        sleep 1
      done
      install -m 0644 -o sing-box -g sing-box ${fragment} ${injected}
    '';
  };

  # keep the runtime dir across restarts so the injected file survives
  systemd.services.sing-box.serviceConfig.RuntimeDirectoryPreserve = "yes";

  # 3. re-inject + restart when hoyofall refreshes (cmp guards against churn)
  systemd.services.hoyofall-singbox-refresh = {
    serviceConfig.Type = "oneshot";
    path = [ pkgs.diffutils ];   # for `cmp`
    script = ''
      sleep 1
      if [ -f ${fragment} ] && ! cmp -s ${fragment} ${injected}; then
        install -m 0644 -o sing-box -g sing-box ${fragment} ${injected}
        systemctl restart sing-box.service
      fi
    '';
  };
  systemd.paths.hoyofall-singbox-refresh = {
    wantedBy = [ "multi-user.target" ];
    after = [ "hoyofall-default.service" ];
    pathConfig.PathChanged = "/run/hoyofall-default";
  };

  # 4. native sing-box config; only reference tags from the fragment
  services.sing-box = {
    enable = true;
    settings = {
      inbounds = [ { type = "mixed"; tag = "mixed-in"; listen = "127.0.0.1"; listen_port = 7890; } ];
      outbounds = [
        { type = "direct"; tag = "direct"; }
        { type = "block"; tag = "block"; }
      ];
      route.final = "proxy";   # provided by the hoyofall fragment
    };
  };
}
```

Notes:

- Keep `convert.emitBuiltinOutbounds = false` (the default): the base `settings`
  already define `direct`/`block`, and duplicate tags make sing-box fail.
- Referencing a tag (e.g. `route.final = "proxy"`) before the fragment exists
  makes sing-box fail to start; the inject oneshot waits for it and `requiredBy`
  gates `sing-box.service`.
- The fragment contains proxy credentials; both `/run/sing-box` and
  `/run/hoyofall-default` are `0700`, so it stays readable only by the two
  service users (the copy is `0644` inside sing-box's own `0700` directory).
- `restartTriggers` is static and cannot watch a runtime file; the `systemd.paths`
  unit is what picks up refreshes. If updates are not critical, drop step 3 and
  restart sing-box manually.
- If a custom group matches nothing it is skipped, so a static reference to it
  (e.g. in the `default` selector) would make sing-box fail. Keep the regions
  you reference non-empty, or set `onEmpty = "fail"` to surface it early.

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
