# hoyofall

**Provably type-safe** conversion from [mihomo](https://github.com/MetaCubeX/mihomo)
(Clash.Meta) subscriptions to [sing-box](https://sing-box.sagernet.org/) `outbounds`.

hoyofall fetches any number of mihomo subscriptions on their own intervals,
converts them to sing-box `outbounds`, and writes an importable fragment to disk
(plus optional HTTP and WebUI control surfaces for GUIs and debugging).

Why a file? sing-box core **cannot import configuration over HTTP** — it reads
local files (`-c`) or a directory (`-C`), and when merging, objects override by
key while arrays append. A fragment's `outbounds` array therefore slots straight
into a base config.

## Highlights

- **Provably type-safe.** TypeScript on [Effect](https://effect.website/): no
  `let`, loops, `try`/`catch`, or `any`. An AST checker in `pnpm lint` fails the
  build on any forbidden construct, so the whole program is pure data flow with
  every failure in a typed error channel.
- **Secure by construction.** Tokens stay out of files via `urlEnv`; the NixOS
  module and shipped systemd unit run as a hardened `DynamicUser`; fragments are
  written atomically (`tmp` + `rename`).
- **Declarative Nix support.** A flake ships the package, an overlay, and a
  NixOS module that validates `settings` against the JSON Schema at build time
  and can own the injection into `services.sing-box`.
- **One instance, many subscriptions.** Each subscription refreshes on its own
  interval; results merge, optionally grouped with regex-based
  `selector`/`urltest` rules.
- **Runs anywhere.** A hardened systemd unit ships for non-Nix users, and an
  all-in-one Magisk/KernelSU module runs the same bundle on Android.

## Start here

- [Configuration](configuration.md) — every option, type and default.
- [Usage](usage.md) — CLI, HTTP endpoints, importing into sing-box.
- [Nix](nix.md) — flake outputs and the NixOS module.
- [systemd](systemd.md) — running without Nix.
- [Android](android.md) — the Magisk/KernelSU module.
- [Design & guarantees](design.md) — how the functional discipline is enforced.
- [Development](development.md) — build, test, and the AST rules.

The short version lives in the repository [README](https://github.com/LiAlH4qwq/hoyofall#readme).
