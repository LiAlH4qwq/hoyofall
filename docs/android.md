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
/data/adb/hoyofall/hoyofall/out/fragment.json   (atomic)   ▼
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

## How it is built

The module is assembled entirely from **prebuilt binaries** — there is no
cross-compilation, and no NDK or Rust toolchain is involved. `nix/android.nix`
fetches:

| Component | Source |
|---|---|
| Node.js (aarch64) | Termux `nodejs` package |
| Nushell (aarch64) | Termux `nushell` package |
| Runtime libraries + CA bundle | Termux (`libc++`, `openssl`, `c-ares`, `libicu`, `libsqlite`, `zlib`, `libffi`, `ca-certificates`) |
| sing-box (arm64) | SagerNet Android release |

All are fixed-output derivations, so every download happens before the build and
the build phases run offline. The flake stages the module payload, the hoyofall
bundle and JSON Schema, the WebUI bundle and the license texts, then writes
`result/module/` and `result/hoyofall-android-arm64.zip`:

```bash
nix build .#hoyofall-android
# -> result/module/ and result/hoyofall-android-arm64.zip
```

nixpkgs' `pkgsCross.aarch64-android*` sets are deliberately not used: they are
uncached and broken when built from source (`compiler-rt`, `tzdata`, …).

`android/` holds the module payload
([`module/`](https://github.com/LiAlH4qwq/hoyofall/tree/main/android/module)),
the WebUI source
([`webui/`](https://github.com/LiAlH4qwq/hoyofall/tree/main/android/webui)), and
the overview in
[`android/README.md`](https://github.com/LiAlH4qwq/hoyofall/blob/main/android/README.md).

## Install

1. Flash `hoyofall-android-arm64.zip` in your module manager and reboot.
2. The seeded `hoyofall.env` defines `HOYOFALL_SUB_URL` as a placeholder
   (`http://127.0.0.1:9/disabled`) so the daemon starts, writes an empty
   fragment and does **not** restart-loop while you configure it. Set your
   subscription URL in `/data/adb/hoyofall/hoyofall/hoyofall.env`
   (`HOYOFALL_SUB_URL=https://…`); the token never lands in `config.yaml`. Edit
   it from the WebUI Config tab or on disk.
3. Adjust `/data/adb/hoyofall/hoyofall/config.yaml` if you want different groups.
4. Adjust the supervisor settings in `/data/adb/hoyofall/android.conf` if needed.

## WebUI

The module ships a `webroot/` React app that a KernelSU-family manager shows as
the module's UI. It talks to the system through the KernelSU WebUI API
(`ksu.exec`), so on KernelSU / SuKiSU / ReSuKiSU it opens from the module page.
**Magisk has no built-in module WebUI**, so Magisk users are advised to install
the standalone KernelSU WebUI implementation —
[`KsuWebUIStandalone`](https://github.com/5ec1cff/KsuWebUIStandalone) (also
works on APatch) — and open hoyofall from there. Either way there is no Magisk
action button. The UI has a **Dashboard**, a **Control / Config / Log** page per
service (hoyofall and sing-box), and is backed entirely by `control.nu`:

- **Dashboard** — live status and Start/Stop/Restart for each service.
- **Control** — per-service status (enabled/running/supervisor) and actions.
  Start/stop writes/removes the service's `disabled` flag (e.g.
  `/data/adb/hoyofall/hoyofall/disabled`, `/data/adb/hoyofall/sing-box/disabled`),
  which the supervisor in `service.nu` honours, so changes take effect
  immediately without a reboot.
- **Config** — three modes backed by `control.nu`:
  - **Form** (hoyofall only): a schema-driven form generated from the same
    Effect `Config` schema the daemon uses, with inline validation and
    comment-preserving YAML edits.
  - **Nushell**: edit a `config.nu` source document — a Nushell script whose
    final expression is the config record. Saving renders it on device (to
    YAML/JSON), validates it, then writes the live config; a render or
    validation failure leaves the running config untouched and the source is
    still saved. This is where functions, loops and imports make complex group
    sets pleasant to write on a phone.
  - **Raw**: the original CodeMirror editor with YAML/JSON highlighting.
  All modes base64-encode the text and call `control.nu` (`set-config` for
  Form/Raw, `set-source` for Nushell, `render-config` for the preview).
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
`config`, `config-source`, `set-config` (base64 from `HOYOFALL_CONFIG_B64`),
`render-config`, `set-source` (base64 from `HOYOFALL_CONFIG_B64`), `log`;
`service` is `hoyofall` or `sing-box` (`status` without a service lists both).
`set-config` and `set-source` validate a candidate config with the service's own
checker before committing it (`hoyofall --check`; sing-box has no standalone
checker because its config is merged with the fragment). `config.nu` runs as
root, like everything else in the module.

## sing-box

sing-box is bundled (`bin/sing-box`, upstream **Android arm64** build) and
supervised like hoyofall. Its data dir is `/data/adb/hoyofall/sing-box/`: the
config is `config.json` (seeded with a safe default: a `127.0.0.1:7890` mixed
inbound and a `direct` outbound), the log is `log/sing-box.log`, and `cache/` is
its working directory (`-D`) — sing-box's cache, and any Clash-API external UI
it downloads, land there. Start/stop/restart/edit/view it from the WebUI
**sing-box** tab.

The supervisor runs
`sing-box run -c …/sing-box/config.json -C /data/adb/hoyofall/hoyofall/out -D /data/adb/hoyofall/sing-box/cache`,
so hoyofall's fragment directory is merged in automatically; set `route.final`
(and inbounds) in `config.json` to route through a hoyofall group. Because
sing-box reads its config once at start, the module **restarts it whenever
hoyofall writes a new fragment** (set `restart_singbox_on_change = false` in
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
`/data/adb/hoyofall/hoyofall/out/fragment.json`. The watcher is idempotent: it
hashes the fragment and only acts on change.

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
| `/data/adb/modules/hoyofall/` | Code only: shims, `.nu` (`services.nu`, `control.nu`, …), `bin/node`, `bin/nu`, `bin/sing-box`, `index.js`, `schema.json`, `lib/`, `webroot/`, seed `config/`. |
| `/data/adb/hoyofall/` | Global data dir. The supervisor settings `android.conf` live here; each app owns a subdir. |
| `/data/adb/hoyofall/android.conf` | Supervisor settings: external sing-box watcher, restart policy, intervals (TOML). |
| `/data/adb/hoyofall/hoyofall/` | hoyofall data dir. |
| `/data/adb/hoyofall/hoyofall/config.yaml` | hoyofall configuration (seeded on first boot). |
| `/data/adb/hoyofall/hoyofall/config.nu` | Optional Nushell source document for the WebUI's Nushell mode; rendered to `config.yaml`. |
| `/data/adb/hoyofall/hoyofall/hoyofall.env` | Subscription tokens (`urlEnv`). |
| `/data/adb/hoyofall/hoyofall/out/fragment.json` | Atomic aggregate fragment; also sing-box's `-C` directory. |
| `/data/adb/hoyofall/hoyofall/disabled` | Present when hoyofall is stopped via the WebUI/`control.nu`. |
| `/data/adb/hoyofall/hoyofall/log/hoyofall.log` | hoyofall stdout/stderr. |
| `/data/adb/hoyofall/sing-box/` | sing-box data dir. |
| `/data/adb/hoyofall/sing-box/config.json` | sing-box configuration (seeded). |
| `/data/adb/hoyofall/sing-box/config.nu` | Optional Nushell source document for the WebUI's Nushell mode; rendered to `config.json`. |
| `/data/adb/hoyofall/sing-box/cache/` | sing-box working dir (`-D`): cache and any Clash-API external UI. |
| `/data/adb/hoyofall/sing-box/disabled` | Present when sing-box is stopped. |
| `/data/adb/hoyofall/sing-box/log/sing-box.log` | sing-box stdout/stderr. |

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

`nix build .#hoyofall-android` pins prebuilt binaries in `nix/android.nix`: the
Termux packages (`nodejsDeb`, `nushellDeb`, the runtime libraries, and the CA
bundle) and `singbox` (the upstream SagerNet Android release).

To refresh Termux: look up the current `Version`, `Filename` and `SHA256` in the
Termux `stable` aarch64 index
(`https://packages.termux.dev/apt/termux-main/dists/stable/main/binary-aarch64/Packages.gz`),
convert the hex SHA to SRI (`nix hash to-sri --type sha256 <hex>`), and update the
`deb` calls; if a package's `Depends` line changes, adjust the `needed` library
list. To refresh sing-box: bump `singbox` in `nix/android.nix`.

## Troubleshooting

- **`node` exits immediately**: check
  `/data/adb/hoyofall/hoyofall/log/hoyofall.log`; a missing `LD_LIBRARY_PATH`
  (staged `lib/`) or an unset `urlEnv` variable both show up there.
- **Fragment never appears**: confirm at least one subscription succeeded; a
  failed refresh is logged and retried on the next interval.
- **sing-box never reloads**: verify `singbox_dir` and `singbox_reload` in
  `android.conf`; the watcher logs each injection and hook result.
- **Build fails applying a patch**: the vendored patches are tied to the pinned
  Node/Nushell versions; re-vendor from the matching Termux revision.
