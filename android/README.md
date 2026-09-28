# android

Android support for hoyofall: an **all-in-one** Magisk-format module (also
installable on KernelSU, SuKiSU and ReSuKiSU) that runs the existing
`dist/index.js` on a prebuilt Android Node, supervises it with Nushell, and
bundles a supervised **sing-box** — all driven from a KernelSU WebUI.

Everything here is **Nushell** (plus the React/TypeScript WebUI); bash is banned
repository-wide (see [`../AGENTS.md`](../AGENTS.md)). The only shell files are the
Magisk module bootstrap shims, each a single `exec` of the bundled `nu` (plus
`customize.sh`, a single `chmod`).

> The module is intentionally all-in-one for now. The planned split into separate
> runtime / supervisor / app / WebUI modules and their stable interfaces is in
> [`../docs/android-future.md`](../docs/android-future.md).

## Subprojects

| Path | What |
|---|---|
| [`node/`](./node/README.md) | Cross-compile Node.js for Android (`aarch64`, later `x86_64`). |
| [`nushell/`](./nushell/README.md) | Cross-compile Nushell for Android (minimal features). |
| [`singbox/`](./singbox/README.md) | Fetch the pinned prebuilt sing-box for Android. |
| [`webui/`](./webui/) | React + Effect + CodeMirror KernelSU WebUI, bundled by rolldown. |
| [`module/`](./module/) | The Magisk payload: shims, `.nu` logic, default configs, WebUI. |

The runtime subprojects are kept self-contained so they can be split into
independent projects later; the Nushell port starts minimal and is meant to grow
toward a full build.

## Build

```bash
# from the repository root
pnpm install && pnpm build            # dist/index.js + webroot/app.js (WebUI)

export ANDROID_NDK_ROOT=/path/to/ndk  # NDK r28+ for Node 26
nu android/build.nu --arch arm64      # node + nushell + sing-box + module tree
nu android/package.nu --arch arm64    # -> android/dist/hoyofall-android-arm64.zip
```

`android/dist/hoyofall-android-arm64.zip` is flashable as-is. `zip` must be on
the build host's `PATH`.

### Nix

The flake assembles the flashable module from prebuilt binaries (Termux Node,
Nushell and their libraries, plus the upstream sing-box Android build), fetched
as fixed-output derivations:

```bash
nix build .#hoyofall-android   # result/{module,hoyofall-android-arm64.zip}
nix develop .#android          # host toolchain + NDK for the pinned scripts
```

`nix/android.nix` extracts the payloads and calls `android/build.nu --stage-only`
+ `android/package.nu`, so the Nix-built and script-built modules share the same
staging logic. Everything is a fixed-output download, so the build phases run
offline. nixpkgs' `pkgsCross.aarch64-android*` sets are not used (uncached and
broken from source); the `node/`, `nushell/` and `singbox/` subprojects remain
the path to build/fetch from source with exact pins.

## Install

1. Flash the zip in Magisk / KernelSU / SuKiSU / ReSuKiSU and reboot.
2. The default config uses a placeholder subscription so it starts without a
   token; set your subscription in `/data/adb/hoyofall/config.yaml` (or via the
   WebUI), e.g. `url: https://…` or `urlEnv: HOYOFALL_SUB_URL` + `hoyofall.env`.
3. sing-box runs with a safe default (`127.0.0.1:7890` mixed inbound); edit
   `/data/adb/hoyofall/singbox/config.json` (or the WebUI) to add inbounds and
   route through a hoyofall group.

The KernelSU WebUI (KernelSU / SuKiSU / ReSuKiSU) has a **Dashboard** and a
**Control / Config / Log** page for each of hoyofall and sing-box. There is no
Magisk action button; the same actions are available via `control.nu`:

```bash
su -c '/system/bin/env LD_LIBRARY_PATH=/data/adb/modules/hoyofall/lib /data/adb/modules/hoyofall/bin/nu --no-config-file /data/adb/modules/hoyofall/control.nu status sing-box'
```

## Layout on device

| Path | Contents |
|---|---|
| `/data/adb/modules/hoyofall/` | Code: shims, `.nu`, `bin/{node,nu,sing-box}`, `index.js`, `lib/`, `webroot/`. |
| `/data/adb/hoyofall/config.yaml` | hoyofall configuration (seeded on first boot). |
| `/data/adb/hoyofall/hoyofall.env` | Subscription tokens (`urlEnv`). |
| `/data/adb/hoyofall/android.conf` | External sing-box watcher settings (TOML). |
| `/data/adb/hoyofall/out/fragment.json` | Atomic aggregate fragment; sing-box's `-C` dir. |
| `/data/adb/hoyofall/disabled` | Present when hoyofall is stopped via the WebUI/`control.nu`. |
| `/data/adb/hoyofall/log/hoyofall.log` | hoyofall stdout/stderr. |
| `/data/adb/hoyofall/singbox/config.json` | sing-box configuration (seeded). |
| `/data/adb/hoyofall/singbox/disabled` | Present when sing-box is stopped. |
| `/data/adb/hoyofall/singbox/sing-box.log` | sing-box stdout/stderr. |

## Design notes

- The module runs the same TypeScript build as every other platform; there is no
  Android-specific application code. See [`../docs/android.md`](../docs/android.md).
- Services are described once in `module/services.nu` and supervised by
  `module/service.nu` (one `job` per service, restart on exit, stop via a flag
  file); `module/control.nu` is the only control surface, used by the WebUI.
- sing-box is started with `-C /data/adb/hoyofall/out`, so hoyofall's fragment is
  merged in; the module restarts sing-box when the fragment changes
  (`restart_singbox_on_change` in `android.conf`).
- The **Nix-built** module bundles a CA (`module/etc/ssl/cert.pem`, staged from
  Termux `ca-certificates`); `service.nu` exports it as
  `SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS` and points `SSL_CERT_DIR` at the
  system store. The script build (`nu android/build.nu`) does not stage a CA
  and falls back to the platform store.
