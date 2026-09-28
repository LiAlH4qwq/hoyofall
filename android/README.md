# android

Android support for hoyofall: a Magisk-format module (also installable on
KernelSU, SuKiSU and ReSuKiSU) that runs the existing `dist/index.js` on a
cross-compiled Android Node, with all module logic in Nushell.

Everything here is **Nushell**; bash is banned repository-wide (see
[`../AGENTS.md`](../AGENTS.md)). The only shell files are the four Magisk module
bootstrap shims, each a single `exec` of the bundled `nu`.

## Subprojects

| Path | What |
|---|---|
| [`node/`](./node/README.md) | Cross-compile Node.js for Android (`aarch64`, later `x86_64`). |
| [`nushell/`](./nushell/README.md) | Cross-compile Nushell for Android (minimal features). |
| [`module/`](./module/) | The Magisk payload: shims, `.nu` logic, default config, WebUI. |

`node/` and `nushell/` are vendored cross-compilation subprojects. They are kept
self-contained on purpose so they can be split into independent projects later;
the Nushell port starts minimal and is meant to grow toward a full build.

## Build

```bash
# from the repository root
pnpm install && pnpm build            # produce dist/index.js

export ANDROID_NDK_ROOT=/path/to/ndk  # NDK r28+ for Node 26
nu android/build.nu --arch arm64      # node + nushell + staged module tree
nu android/package.nu --arch arm64    # -> android/dist/hoyofall-android-arm64.zip
```

`android/dist/hoyofall-android-arm64.zip` is flashable as-is. `zip` must be on
the build host's `PATH`.

### Nix

The flake assembles the flashable module from prebuilt Termux aarch64 binaries
(Node, Nushell and their shared libraries), fetched as fixed-output derivations:

```bash
nix build .#hoyofall-android   # result/{module,hoyofall-android-arm64.zip}
nix develop .#android          # host toolchain + NDK for the pinned scripts
```

`nix/android.nix` extracts the Termux payload and calls
`android/build.nu --stage-only` + `android/package.nu`, so the Nix-built and
script-built modules share the same staging logic. Everything is a fixed-output
download, so the build phases run offline. nixpkgs'
`pkgsCross.aarch64-android*` sets are not used (uncached and broken from source);
the `node/` and `nushell/` subprojects remain the path to build from source with
the NDK and exact pinned versions + Termux patches.

## Install

1. Flash the zip in Magisk / KernelSU / SuKiSU / ReSuKiSU and reboot.
2. Edit `/data/adb/hoyofall/hoyofall.env` and set your token, e.g.
   `HOYOFALL_SUB_URL=https://…`.
3. Edit `/data/adb/hoyofall/config.yaml` if you want different groups.
4. Point your sing-box module at the fragment: set `singbox_dir` (and optionally
   `singbox_reload`) in `/data/adb/hoyofall/android.conf`. The watcher copies the
   atomic fragment into that directory and triggers the reload hook on change.

The Magisk action button (or `su -c 'sh /data/adb/modules/hoyofall/action.sh'`)
restarts the daemon and prints the log tail.

## Layout on device

| Path | Contents |
|---|---|
| `/data/adb/modules/hoyofall/` | Code: shims, `.nu`, `bin/node`, `bin/nu`, `index.js`. |
| `/data/adb/hoyofall/config.yaml` | Configuration (seeded on first boot). |
| `/data/adb/hoyofall/hoyofall.env` | Subscription tokens (`urlEnv`). |
| `/data/adb/hoyofall/android.conf` | sing-box hook settings (TOML). |
| `/data/adb/hoyofall/out/fragment.json` | Atomic aggregate fragment. |
| `/data/adb/hoyofall/log/hoyofall.log` | Daemon stdout/stderr. |

## Design notes

- The module runs the same TypeScript build as every other platform; there is no
  Android-specific application code. See [`../docs/android.md`](../docs/android.md).
- The daemon is supervised from `service.nu` (a blocking restart loop). The
  fragment watcher runs as a Nushell `job` in the same script.
- HTTPS works with Node's bundled CA store; set `NODE_EXTRA_CA_CERTS` (or
  `SSL_CERT_DIR`) in the environment if you need extra roots.
