# hoyofall

**English** · [简体中文](./README.CN.md)

> Turn mihomo (Clash.Meta) subscriptions into sing-box `outbounds` —
> continuously, atomically, and provably type-safe.

[![CI](https://github.com/LiAlH4qwq/hoyofall/actions/workflows/ci.yml/badge.svg)](https://github.com/LiAlH4qwq/hoyofall/actions/workflows/ci.yml)
[![Website](https://github.com/LiAlH4qwq/hoyofall/actions/workflows/pages.yml/badge.svg)](https://github.com/LiAlH4qwq/hoyofall/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

hoyofall fetches any number of mihomo subscriptions on their own intervals,
converts them to sing-box `outbounds`, and writes an importable fragment to disk
(plus optional HTTP and WebUI control surfaces for GUIs and debugging). It is a
small, **provably type-safe** daemon: TypeScript on
[Effect](https://effect.website/) with no `let`, loops, `try`/`catch`, or `any`.
An AST checker in `pnpm lint` fails the build on any forbidden construct, so the
whole program is pure data flow with every failure in a typed error channel.

## Install

NixOS module:

```nix
{
  inputs.hoyofall.url = "github:LiAlH4qwq/hoyofall";
  imports = [ inputs.hoyofall.nixosModules.default ];

  services.hoyofall = {
    enable = true;
    settings.subscriptions.default = { urlEnv = "SUB_URL"; };
    environmentFile = "/run/secrets/hoyofall.env";
    singboxIntegration.enable = true;
  };
}
```

Package / standalone (`contrib/systemd/` ships hardened units for non-Nix users):

```bash
nix build github:LiAlH4qwq/hoyofall      # ./result/bin/hoyofall
nix profile install github:LiAlH4qwq/hoyofall
```

Android (all-in-one Magisk/KernelSU module, built from prebuilt binaries):

```bash
nix build .#hoyofall-android             # result/hoyofall-android-arm64.zip
```

## Documentation

Full documentation is at **<https://LiAlH4qwq.github.io/hoyofall/>**
(English and [简体中文](https://LiAlH4qwq.github.io/hoyofall/zh/)):

- [Configuration](https://LiAlH4qwq.github.io/hoyofall/en/configuration.html) — every option, type and default.
- [Usage](https://LiAlH4qwq.github.io/hoyofall/en/usage.html) — CLI, HTTP endpoints, importing into sing-box.
- [Nix](https://LiAlH4qwq.github.io/hoyofall/en/nix.html) — flake outputs and the NixOS module.
- [systemd](https://LiAlH4qwq.github.io/hoyofall/en/systemd.html) — running without Nix.
- [Android](https://LiAlH4qwq.github.io/hoyofall/en/android.html) — the Magisk/KernelSU module.
- [Design & guarantees](https://LiAlH4qwq.github.io/hoyofall/en/design.html) — how the functional discipline is enforced.
- [Development](https://LiAlH4qwq.github.io/hoyofall/en/development.html) — build, test, and the AST rules.

## Supported conversions

Proxies: `ss`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`, `tuic`,
`wireguard`, `http`, `socks5`, `anytls`. Groups: regex/typed selectors and
urltest from `groups.custom`, plus converted native `proxy-groups`. Everything
else becomes a typed warning and is skipped, or fails the subscription with
`onUnsupported: fail`.

## License

hoyofall's own code is [MIT](./LICENSE). The Android module additionally
redistributes third-party binaries under their own terms — most notably
[GPL-3.0-or-later](https://github.com/LiAlH4qwq/hoyofall/blob/main/licenses/GPL-3.0-or-later.txt)
sing-box — so the flashable module is an aggregate, not an MIT relicensing. See
[THIRD_PARTY_LICENSES.md](https://github.com/LiAlH4qwq/hoyofall/blob/main/THIRD_PARTY_LICENSES.md).
