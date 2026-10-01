# android

Android support for hoyofall: an **all-in-one** Magisk-format module (also
installable on KernelSU, SuKiSU and ReSuKiSU) that runs the existing
`dist/index.js` on a prebuilt Android Node, supervises it with a **Node + Effect**
app, and bundles a supervised **sing-box** — all driven from a KernelSU WebUI.

Authored logic is **TypeScript** (the supervisor in [`supervisor/`](./supervisor/)
and the React WebUI); bash is banned repository-wide (see
[`../AGENTS.md`](../AGENTS.md)). The only shell files are the Magisk module
bootstrap shims, each a single `exec` of the bundled Node runtime (plus
`customize.sh`, a single `chmod`).

> The module is intentionally all-in-one for now. The planned split into separate
> runtime / supervisor / app / WebUI modules and their stable interfaces is in
> [`../docs/android-future.md`](../docs/android-future.md).

## Layout

| Path | What |
|---|---|
| [`supervisor/`](./supervisor/) | Node + Effect supervisor, control protocol and boot hooks, bundled by rolldown. |
| [`webui/`](./webui/) | React + Effect + CodeMirror KernelSU WebUI, bundled by rolldown. |
| [`module/`](./module/) | The Magisk payload: shims, `supervisor.js`, default configs, WebUI. |

The module is staged from **prebuilt binaries**: `nix/android.nix` fetches
Termux aarch64 Node (with its libraries and a CA bundle) and the upstream
SagerNet sing-box Android build as fixed-output derivations, then stages and
zips the module. `tsnix` is the one source-built piece — cross-compiled against
Android bionic by `nix/tsnix-android.nix`.

## Build

```bash
# from the repository root
nix build .#hoyofall-android   # result/{module,hoyofall-android-arm64.zip}
```

`result/hoyofall-android-arm64.zip` is flashable as-is. The build phases run
offline once the fixed-output downloads are fetched. nixpkgs'
`pkgsCross.aarch64-android*` sets are not used (uncached and broken from
source).

## Install

1. Flash the zip in Magisk / KernelSU / SuKiSU / ReSuKiSU and reboot.
2. The seeded `hoyofall.env` defines `HOYOFALL_SUB_URL` as a placeholder so it
   starts without a token; set your subscription in
   `/data/adb/hoyofall/hoyofall/hoyofall.env` (or via the WebUI). The token never
   lands in `config.yaml`.
3. sing-box runs with a safe default (`127.0.0.1:7890` mixed inbound); edit
   `/data/adb/hoyofall/sing-box/config.json` (or the WebUI) to add inbounds and
   route through a hoyofall group.

The module's WebUI has a **Dashboard** and a **Control / Config / Log** page for
each of hoyofall and sing-box. The **Config** page offers a schema-driven
**Form** (hoyofall only) and **Raw** text. On KernelSU / SuKiSU / ReSuKiSU it
opens from the module page; on **Magisk** (and APatch) install the standalone
KernelSU WebUI app
([`KsuWebUIStandalone`](https://github.com/5ec1cff/KsuWebUIStandalone)) and open
hoyofall from there. There is no Magisk action button; the same actions are
available via the supervisor's control command:

```bash
su -c '/system/bin/env LD_LIBRARY_PATH=/data/adb/modules/hoyofall/lib /data/adb/modules/hoyofall/bin/node /data/adb/modules/hoyofall/supervisor.js control status sing-box'
```

## Layout on device

| Path | Contents |
|---|---|
| `/data/adb/modules/hoyofall/` | Code only: shims, `supervisor.js`, `bin/{node,sing-box}`, `index.js`, `schema.json`, `lib/`, `webroot/`, seed `config/`. |
| `/data/adb/hoyofall/` | Global data dir; `android.conf` (supervisor settings) lives here. |
| `/data/adb/hoyofall/hoyofall/config.yaml` | hoyofall configuration (seeded on first boot). |
| `/data/adb/hoyofall/hoyofall/config.nix` | Nix source; rendered to `config.yaml` on save. |
| `/data/adb/hoyofall/hoyofall/hoyofall.env` | Subscription tokens (`urlEnv`). |
| `/data/adb/hoyofall/hoyofall/out/fragment.json` | Atomic aggregate fragment; sing-box's `-C` dir. |
| `/data/adb/hoyofall/hoyofall/disabled` | Present when hoyofall is stopped via the WebUI/control protocol. |
| `/data/adb/hoyofall/hoyofall/log/hoyofall.log` | hoyofall stdout/stderr. |
| `/data/adb/hoyofall/sing-box/config.json` | sing-box configuration (seeded). |
| `/data/adb/hoyofall/sing-box/config.nix` | Nix source; rendered to `config.json` on save. |
| `/data/adb/hoyofall/sing-box/cache/` | sing-box working dir (`-D`): cache and Clash-API UI. |
| `/data/adb/hoyofall/sing-box/disabled` | Present when sing-box is stopped. |
| `/data/adb/hoyofall/sing-box/log/sing-box.log` | sing-box stdout/stderr. |

## Design notes

- The module runs the same TypeScript build as every other platform; there is no
  Android-specific application code. See [`../docs/android.md`](../docs/android.md).
- Services are described once in `supervisor/src/services.ts` and supervised by
  `supervisor/src/supervise.ts` (one fiber per service, restart on exit, stop via
  a flag file); `supervisor/src/control.ts` is the only control surface, used by
  the WebUI.
- sing-box is started with
  `-C /data/adb/hoyofall/hoyofall/out -D /data/adb/hoyofall/sing-box/cache`, so
  hoyofall's fragment is merged in and its cache/Clash UI stay under the sing-box
  data dir; the module restarts sing-box when the fragment changes
  (`restart_singbox_on_change` in `android.conf`).
- The module bundles a CA (`module/etc/ssl/cert.pem`, staged from Termux
  `ca-certificates`); the supervisor exports it as
  `SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS` and points `SSL_CERT_DIR` at the
  system store.
