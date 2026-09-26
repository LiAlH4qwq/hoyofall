# hoyofall

**English** · [简体中文](./README.CN.md)

> Turn mihomo (Clash.Meta) subscriptions into sing-box `outbounds` —
> continuously, atomically, and without a Web UI.

hoyofall is a small headless daemon. It fetches any number of mihomo
subscriptions on their own intervals, converts them to sing-box `outbounds`, and
writes an importable fragment to disk (plus an optional HTTP endpoint for GUIs
and debugging).

Why a file? sing-box core **cannot import configuration over HTTP** — it reads
local files (`-c`) or a directory (`-C`), and when merging, objects override by
key while arrays append. A fragment's `outbounds` array therefore slots straight
into a base config.

## Highlights

- **Functional, and provable.** TypeScript on [Effect](https://effect.website/):
  no `let`, loops, `try`/`catch`, or `any`. An AST checker in `pnpm lint` fails
  the build on any forbidden construct, so the whole program is pure data flow
  with every failure in a typed error channel.
- **Secure by construction.** Tokens stay out of files via `urlEnv`; the NixOS
  module and shipped systemd unit run as a hardened `DynamicUser`; fragments are
  written atomically (`tmp` + `rename`).
- **Declarative Nix support.** A flake ships the package, an overlay, and a
  NixOS module that validates `settings` against the JSON Schema at build time
  and can own the injection into `services.sing-box`.
- **One instance, many subscriptions.** Each subscription refreshes on its own
  interval; results merge, optionally grouped with regex-based
  `selector`/`urltest` rules.
- **Runs anywhere.** A hardened systemd unit ships for non-Nix users.

## Quick start — NixOS

```nix
{
  inputs.hoyofall.url = "github:LiAlH4qwq/hoyofall";
  imports = [ inputs.hoyofall.nixosModules.default ];

  services.hoyofall = {
    enable = true;
    settings = {
      subscriptions.default = { urlEnv = "SUB_URL"; };
      groups.custom = {
        "hk-auto" = { type = "urltest"; includeRegexes = [ "HK" ]; };
        default = {
          type = "selector";
          includeProxies = false;
          includeCustomGroups = true;
          includeDirect = true;
        };
      };
    };
    environmentFile = "/run/secrets/hoyofall.env";
    singboxIntegration.enable = true;
  };
}
```

The module runs one `hoyofall.service`, validates `settings` against the shipped
JSON Schema at build time, and (with `singboxIntegration`) injects the fragment
into `services.sing-box` and restarts it on change. Full options and notes:
[docs/nix.md](./docs/nix.md).

## Quick start — systemd (no Nix)

```bash
git clone https://github.com/LiAlH4qwq/hoyofall && cd hoyofall
pnpm install && pnpm build                 # produces a self-contained dist/index.js
sudo install -d /etc/hoyofall
sudo install -m 0755 dist/index.js /usr/local/bin/hoyofall
sudo install -m 0644 config.example.yaml /etc/hoyofall/config.yaml
```

Point `output.file.path` at `/var/lib/hoyofall/fragment.json`, then install
[`contrib/systemd/hoyofall.service`](./contrib/systemd/hoyofall.service):

```bash
sudo install -m 0644 contrib/systemd/hoyofall.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hoyofall.service
```

Step-by-step, including the optional sing-box refresh units:
[docs/systemd.md](./docs/systemd.md).

## Install the package only

```bash
nix build github:LiAlH4qwq/hoyofall        # ./result/bin/hoyofall
# or
nix profile install github:LiAlH4qwq/hoyofall
```

Then run it directly:

```bash
hoyofall --config /etc/hoyofall/config.yaml
hoyofall --print-schema          # configuration JSON Schema
hoyofall --help
```

## Documentation

| Page | Contents |
|---|---|
| [Configuration](./docs/configuration.md) | Every option, type and default. |
| [Usage](./docs/usage.md) | CLI, HTTP endpoints, importing into sing-box. |
| [Nix](./docs/nix.md) | Flake outputs and the NixOS module. |
| [systemd](./docs/systemd.md) | Running without Nix. |
| [Design](./docs/design.md) | Functional guarantees and how they are enforced. |
| [Development](./docs/development.md) | Build, test, and the AST rules. |

## Supported conversions

Proxies: `ss`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`, `tuic`,
`wireguard`, `http`, `socks5`, `anytls`.

Groups: `groups.custom` (instance-level, recommended) or per-subscription
groups, built by matching subscription and entity names with regexes and typed
members. Native `proxy-groups` (`groups.native.enable`) map
`select → selector`, `url-test → urltest`, `fallback → urltest`,
`load-balance → selector`.

Everything else becomes a typed warning and is skipped, or fails the
subscription with `onUnsupported: fail`.

## License

[MIT](./LICENSE)
