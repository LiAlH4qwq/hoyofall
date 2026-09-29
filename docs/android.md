# Android (Magisk / KernelSU / SuKiSU / ReSuKiSU)

hoyofall ships on Android as one **all-in-one Magisk-format module**. It runs the
same `dist/index.js` bundle as every other platform on a prebuilt Android **Node**,
drives itself with **Nushell**, and additionally bundles and supervises
**sing-box**, all controlled from a KernelSU-family **WebUI**. It installs
unchanged on Magisk, KernelSU, SuKiSU and ReSuKiSU, which share the module format.

```
mihomo subscription (HTTPS)
        │  bin/node + index.js                 WebUI (KernelSU ksu.exec)
        ▼                                            │ control.nu
/data/adb/hoyofall/out/fragment.json   (atomic)      ▼
        │  bin/sing-box run -c … -C out   ◄── service.nu supervisor
        ▼
   tun / mixed proxy
```

> The current module is deliberately **all-in-one**. A future release splits it
> into independent modules (Node, Nushell, a generalized Nushell supervisor, the
> hoyofall app, sing-box, the WebUI); the intended decomposition, interfaces and
> migration notes are in [`android-future.md`](./android-future.md), written for
> both humans and agents.

## Why Node, not a rewrite

[Perry](https://github.com/PerryTS/perry) can compile TypeScript to native code,
but its Android target produces a **JNI application**, not a shell daemon, and
`effect` relies on `Proxy` and Node internals that Perry only partially supports.
Rewriting the app around a different runtime would be a port, not a build flag.
Porting Node (which already runs this exact bundle) is the smaller, safer change.

## Subprojects

`android/` contains the cross-compilation subprojects, the prebuilt payload
fetchers, the WebUI source and the module payload. They are kept self-contained
so they can be extracted into independent projects later; the Nushell port starts
**minimal** and is meant to grow toward a full build. The overview is in
[`../android/README.md`](../android/README.md).

| Path | What |
|---|---|
| [`../android/node/`](../android/node/README.md) | Cross-compile Node.js for Android. |
| [`../android/nushell/`](../android/nushell/README.md) | Cross-compile Nushell for Android (minimal features). |
| [`../android/singbox/`](../android/singbox/README.md) | Fetch the pinned prebuilt sing-box for Android. |
| [`../android/webui/`](../android/webui/README.md) | TypeScript WebUI (React + Effect + CodeMirror), bundled by rolldown. |
| [`../android/module/`](../android/module/) | Magisk payload: shims, `.nu` logic (`services.nu`), config, WebUI. |

The Nix flake does not build the cross toolchain: `nix/android.nix` fetches the
Termux (Node/Nushell) and sing-box binaries as fixed-output derivations and
assembles the module.

Every pinned version lives in `android/*/versions.lock`, and every vendored patch
is committed under `android/*/patches/` with its Termux provenance commit — no
floating downloads.

## Prerequisites

- Android NDK **r28 or newer** (Node 26 needs clang ≥ 19).
- Rust (≥ `android/nushell/versions.lock` `rust_version`) with `rustup`.
- `pnpm`, `zip`, `curl`, `make`, `python3`, `patch`, a C toolchain.
- `nushell` to run the build scripts (available in `nix develop .#android`).

## Build

```bash
pnpm install && pnpm build             # produce dist/index.js

export ANDROID_NDK_ROOT=/path/to/ndk
nu android/build.nu --arch arm64       # node + nushell + staged module tree
nu android/package.nu --arch arm64     # -> android/dist/hoyofall-android-arm64.zip
```

`--arch x86_64` is supported by the Node and Nushell sub-builds for emulators
and Intel devices; sing-box is arm64-only, so x86_64 needs `--skip-singbox`.
arm64 is the default and the tested target. `nu android/build.nu --help` lists
`--skip-node`, `--skip-nushell`, `--skip-singbox`, `--features` and `--force`.

## Build with Nix

The flake assembles the flashable module from **prebuilt Termux aarch64
binaries** (Node, Nushell and their shared libraries) and the repository's
Nushell staging/zip logic:

```bash
nix build .#hoyofall-android
# -> result/module/ and result/hoyofall-android-arm64.zip

# host toolchain + NDK for building the pinned subprojects from source
nix develop .#android
```

`nix/android.nix` deliberately does **not** use nixpkgs'
`pkgsCross.aarch64-android*` sets: they are not in the binary cache and are
broken when built from source (`compiler-rt`, then `tzdata`, …). Instead it
fetches the Termux packages as fixed-output derivations (so all downloads happen
before the build and the build phases run offline), extracts `bin/node`,
`bin/nu`, the needed `*.so` libraries and the CA bundle, and calls
`android/build.nu --stage-only` + `android/package.nu` to assemble the module.
The `devShell` still provides the NDK so you can build the pinned sources with
`nu android/build.nu` if you prefer.

The flake enables `allowUnfree` for its own packages because the NDK in
`devShells.android` is unfree.

## Install

1. Flash `hoyofall-android-arm64.zip` in your module manager and reboot.
2. The default `config.yaml` ships a placeholder subscription
   (`http://127.0.0.1:9/disabled`) so the daemon starts, writes an empty
   fragment and does **not** restart-loop while you configure it. Point
   `subscriptions.default` at your subscription — either a literal `url`, or
   `urlEnv: HOYOFALL_SUB_URL` with the token in `/data/adb/hoyofall/hoyofall.env`
   (`HOYOFALL_SUB_URL=https://…`). Edit it from the WebUI Config tab or on disk.
3. Adjust `/data/adb/hoyofall/config.yaml` if you want different groups.
4. Point sing-box at the fragment via `/data/adb/hoyofall/android.conf`.

## WebUI (KernelSU / SuKiSU / ReSuKiSU)

The module ships a `webroot/` React app that the KernelSU manager shows as the
module's UI. It talks to the system through the KernelSU WebUI API (`ksu.exec`),
so it only works inside those managers — there is no Magisk action button. It has
a **Dashboard**, a **Control / Config / Log** page per service (hoyofall and
sing-box), and is backed entirely by `control.nu`:

- **Dashboard** — live status and Start/Stop/Restart for each service.
- **Control** — per-service status (enabled/running/supervisor) and actions.
  Start/stop writes/removes the service's `disabled` flag (e.g.
  `/data/adb/hoyofall/disabled`), which the supervisor in `service.nu` honours, so
  changes take effect immediately without a reboot.
- **Config** — a CodeMirror editor with YAML/JSON highlighting and a
  saved/unsaved indicator; saving base64-encodes the text and calls
  `control.nu set-config <service>`.
- **Log** — a smart log view (line filter, follow/auto-scroll) reading the last
  300 lines via `control.nu log <service>`.

The app is written in TypeScript/TSX under `android/webui/` and bundled into
`webroot/app.js` with the repository's rolldown (`pnpm build:webui`, part of
`pnpm build`). It is a pnpm workspace package (`android/webui/package.json`) and
uses React, Effect and CodeMirror; add more packages there and rolldown bundles
them.

```bash
# control.nu also works directly (note LD_LIBRARY_PATH for the bundled nu)
su -c '/system/bin/env LD_LIBRARY_PATH=/data/adb/modules/hoyofall/lib /data/adb/modules/hoyofall/bin/nu --no-config-file /data/adb/modules/hoyofall/control.nu status sing-box'
```

`control.nu <action> [service]` actions: `status`, `start`, `stop`, `restart`,
`config`, `set-config` (base64 from `HOYOFALL_CONFIG_B64`), `log`; `service` is
`hoyofall` or `sing-box` (`status` without a service lists both).

## sing-box

sing-box is bundled (`bin/sing-box`, upstream **Android arm64** build) and
supervised like hoyofall. Its config is
`/data/adb/hoyofall/singbox/config.json` (seeded with a safe default: a
`127.0.0.1:7890` mixed inbound and a `direct` outbound) and its log is
`/data/adb/hoyofall/singbox/sing-box.log`. Start/stop/restart/edit/view it from
the WebUI **sing-box** tab.

The supervisor runs `sing-box run -c config.json -C /data/adb/hoyofall/out`, so
hoyofall's fragment directory is merged in automatically; set `route.final` (and
inbounds) in `config.json` to route through a hoyofall group. Because sing-box
reads its config once at start, the module **restarts it whenever hoyofall writes
a new fragment** (set `restart_singbox_on_change = false` in
`/data/adb/hoyofall/android.conf` to opt out), or enable the external watcher
below to feed a separate sing-box module instead.

To feed a *separate* sing-box module instead, `service.nu` also has an optional
watcher that copies the atomic fragment into that module's config directory and
runs a reload hook on change — configure it in
`/data/adb/hoyofall/android.conf` (TOML):

```toml
watch_singbox = true
singbox_dir = "/data/adb/box/conf"                 # an external sing-box config dir
singbox_target = "hoyofall.json"
singbox_reload = ["/system/bin/pkill", "-HUP", "sing-box"]
watch_interval_seconds = 5
```

`singbox_dir = ""` disables injection; hoyofall still writes
`/data/adb/hoyofall/out/fragment.json`. The watcher is idempotent: it hashes the
fragment and only acts on change.

## Shims

The Magisk/KernelSU module API executes `customize.sh`, `post-fs-data.sh`,
`service.sh` and `uninstall.sh` with the system shell, so these four files are
the **only** shell scripts this repository permits. Each `exec`s the bundled
Nushell with a hardcoded path and **no logic** (the prebuilt payload's `lib/` is
put on `LD_LIBRARY_PATH` via `/system/bin/env`, since the shim runs `nu` before
`service.nu` can set it):

```sh
#!/system/bin/sh
exec /system/bin/env LD_LIBRARY_PATH=/data/adb/modules/hoyofall/lib /data/adb/modules/hoyofall/bin/nu --no-config-file /data/adb/modules/hoyofall/service.nu
```

`customize.sh` is the one exception: Magisk's installer applies default module
permissions (files `0644`), clearing the exec bit on `bin/node`, `bin/nu` and
`bin/sing-box` before any shim can run, so `customize.sh` restores it with a
single `chmod`:

```sh
#!/system/bin/sh
chmod 0755 "$MODPATH"/bin/* "$MODPATH"/*.sh
```

All behaviour lives in the matching `.nu` file. `scripts/check-shell.ts`
allowlists exactly these files; anything else is rejected by `pnpm lint`.

## Layout on device

| Path | Contents |
|---|---|
| `/data/adb/modules/hoyofall/` | Code: shims, `.nu` (`services.nu`, `control.nu`, …), `bin/node`, `bin/nu`, `bin/sing-box`, `index.js`, `lib/`, `webroot/`. |
| `/data/adb/hoyofall/config.yaml` | hoyofall configuration (seeded on first boot). |
| `/data/adb/hoyofall/hoyofall.env` | Subscription tokens (`urlEnv`). |
| `/data/adb/hoyofall/android.conf` | external sing-box watcher settings (TOML). |
| `/data/adb/hoyofall/out/fragment.json` | Atomic aggregate fragment; also sing-box's `-C` directory. |
| `/data/adb/hoyofall/disabled` | Present when hoyofall is stopped via the WebUI/`control.nu`. |
| `/data/adb/hoyofall/log/hoyofall.log` | hoyofall stdout/stderr. |
| `/data/adb/hoyofall/singbox/config.json` | sing-box configuration (seeded). |
| `/data/adb/hoyofall/singbox/disabled` | Present when sing-box is stopped. |
| `/data/adb/hoyofall/singbox/sing-box.log` | sing-box stdout/stderr. |

## Security notes

- The module runs as **root** (the module manager's context). The Node daemon
  fetches remote subscriptions, so keep the module manager and its downloads
  trustworthy, and prefer `urlEnv` tokens in `hoyofall.env` over `config.yaml`.
- HTTPS uses Node's CA store. The Nix-built module bundles Termux's
  `ca-certificates` as `module/etc/ssl/cert.pem`, and `service.nu` exports it via
  `SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS`; extra roots can also be set through
  `SSL_CERT_DIR=/system/etc/security/cacerts` in `service.nu`. Do not hardcode
  them in the shim.
- The module bundles Node's and Nushell's shared libraries in `module/lib/`; the
  shims put that directory on `LD_LIBRARY_PATH`.
- Fragments are written atomically (temp file + `rename`), so a reader never sees
  a partial file even if the daemon is killed mid-write.

## Updating pins

There are two build paths; update the pins for whichever you use.

The **Nix-built module** (`nix build .#hoyofall-android`) pins prebuilt binaries in
`nix/android.nix`: the Termux packages (`nodejsDeb`, `nushellDeb`, the runtime
libraries, and the CA bundle) and `singbox` (the upstream SagerNet Android
release). To refresh Termux: look up the current `Version`, `Filename` and
`SHA256` in the Termux `stable` aarch64 index
(`https://packages.termux.dev/apt/termux-main/dists/stable/main/binary-aarch64/Packages.gz`),
convert the hex SHA to SRI (`nix hash to-sri --type sha256 <hex>`), and update the
`deb` calls; if a package's `Depends` line changes, adjust the `needed` library
list. To refresh sing-box: bump `sing-box` in `nix/android.nix` and
`android/singbox/versions.lock` together.

The **source-built subprojects** (`nu android/build.nu`) pin their own inputs:

- **Node**: bump `node_version`, `node_tarball`, `node_url` and `node_sha256` in
  `android/node/versions.lock` (the checksum is in
  `nodejs.org/dist/v<version>/SHASUMS256.txt`), then re-vendor
  `android/node/patches/termux/` from the matching Termux `nodejs` revision and
  update `patches_commit`.
- **Nushell**: bump the version, URL and SHA-256 in
  `android/nushell/versions.lock`, re-vendor `patches/termux/`, and update
  `patches_commit`. Add Cargo features with `--features` if a `.nu` script needs
  more than the minimal set.
- **sing-box**: bump `singbox_version`, `singbox_url` and `singbox_sha256` in
  `android/singbox/versions.lock` (`fetch.nu` downloads and verifies it).
- **NDK**: no download is pinned; the scripts validate `source.properties` and
  the documented minimum revision.

## Troubleshooting

- **`node` exits immediately**: check `/data/adb/hoyofall/log/hoyofall.log`; a
  missing `LD_LIBRARY_PATH` (staged `lib/`) or an unset `urlEnv` variable both
  show up there.
- **Fragment never appears**: confirm at least one subscription succeeded; a
  failed refresh is logged and retried on the next interval.
- **sing-box never reloads**: verify `singbox_dir` and `singbox_reload` in
  `android.conf`; the watcher logs each injection and hook result.
- **Build fails applying a patch**: the vendored patches are tied to the pinned
  Node/Nushell versions; re-vendor from the matching Termux revision.
