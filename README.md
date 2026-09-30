# hoyofall

**English** · [简体中文](./README.CN.md)

> Turn mihomo (Clash.Meta) subscriptions into sing-box `outbounds` —
> continuously, atomically, and provably type-safe.

hoyofall is a small, provably type-safe daemon. It fetches any number of mihomo
subscriptions on their own intervals, converts them to sing-box `outbounds`, and
writes an importable fragment to disk (plus optional HTTP and WebUI control
surfaces for GUIs and debugging).

Why a file? sing-box core **cannot import configuration over HTTP** — it reads
local files (`-c`) or a directory (`-C`), and when merging, objects override by
key while arrays append. A fragment's `outbounds` array therefore slots straight
into a base config.

## Highlights

- **Provably type-safe.** TypeScript on [Effect](https://effect.website/):
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
        "hk-auto" = { level = 1; type = "urltest"; includeRegexes = [ "HK" ]; };
        default = {
          level = 2;
          type = "selector";
          includeProxies = false;
          includeLevels = [ 1 ];
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
hoyofall --check --config /etc/hoyofall/config.yaml   # validate and exit
hoyofall --print-schema          # configuration JSON Schema
hoyofall --help
```

## Run on Android (Magisk / KernelSU / SuKiSU / ReSuKiSU)

hoyofall ships as an all-in-one flashable module: the same `dist/index.js` on a
prebuilt Android Node, supervised by Nushell, **plus a supervised sing-box** and
a KernelSU **WebUI** (dashboard, start/stop, config editor — schema form,
Nushell, or raw — and logs). Nix assembles
it from prebuilt Termux aarch64 binaries and the upstream sing-box build (all
fixed-output downloads):

```bash
nix build .#hoyofall-android          # -> result/hoyofall-android-arm64.zip
```

Flash the zip with Magisk/KernelSU; the default config starts without a token.
Configure subscriptions and sing-box from the WebUI — native on
KernelSU/SuKiSU/ReSuKiSU, or via the standalone
[`KsuWebUIStandalone`](https://github.com/5ec1cff/KsuWebUIStandalone) app on
Magisk — or under `/data/adb/hoyofall/` (each app has its own subdir: `hoyofall/`
and `sing-box/`).
Full guide: [docs/android.md](./docs/android.md); the planned split into separate
modules is in [docs/android-future.md](./docs/android-future.md).

## Documentation

| Page | Contents |
|---|---|
| [Configuration](./docs/configuration.md) | Every option, type and default. |
| [Usage](./docs/usage.md) | CLI, HTTP endpoints, importing into sing-box. |
| [Nix](./docs/nix.md) | Flake outputs and the NixOS module. |
| [systemd](./docs/systemd.md) | Running without Nix. |
| [Android](./docs/android.md) | Magisk/KernelSU module (prebuilt Node, Nushell and sing-box). |
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

hoyofall's own code is [MIT](./LICENSE). The Android module additionally
redistributes third-party binaries under their own terms — most notably
[GPL-3.0-or-later](./licenses/GPL-3.0-or-later.txt) sing-box — so the flashable
module is an aggregate, not an MIT relicensing. See
[THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md).
