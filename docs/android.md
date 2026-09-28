# Android (Magisk / KernelSU / SuKiSU / ReSuKiSU)

hoyofall runs on Android as a **Magisk-format module**. The module runs the same
`dist/index.js` bundle as every other platform, on a **cross-compiled Node**, and
drives itself with **Nushell**. It installs unchanged on Magisk, KernelSU,
SuKiSU and ReSuKiSU, which share the module format.

```
mihomo subscription (HTTPS)
        │  Node + dist/index.js  (android/node)
        ▼
/data/adb/hoyofall/out/fragment.json   (atomic write)
        │  service.nu watcher  (android/nushell)
        ▼
your sing-box module's config directory  → reload hook
```

## Why Node, not a rewrite

[Perry](https://github.com/PerryTS/perry) can compile TypeScript to native code,
but its Android target produces a **JNI application**, not a shell daemon, and
`effect` relies on `Proxy` and Node internals that Perry only partially supports.
Rewriting the app around a different runtime would be a port, not a build flag.
Porting Node (which already runs this exact bundle) is the smaller, safer change.

## Subprojects

`android/` contains two vendored cross-compilation subprojects and the module
payload. They are kept self-contained so they can be extracted into independent
projects later; the Nushell port starts **minimal** and is meant to grow toward a
full build.

| Path | What |
|---|---|
| [`../android/node/`](../android/node/README.md) | Cross-compile Node.js for Android. |
| [`../android/nushell/`](../android/nushell/README.md) | Cross-compile Nushell for Android (minimal features). |
| [`../android/module/`](../android/module/) | Magisk payload: shims, `.nu` logic, config, WebUI. |

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

`--arch x86_64` is supported by both sub-builds for emulators and Intel devices;
arm64 is the default and the tested target. `nu android/build.nu --help` lists
`--skip-node`, `--skip-nushell`, `--features` and `--force`.

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
2. Set the subscription token in `/data/adb/hoyofall/hoyofall.env`:
   ```
   HOYOFALL_SUB_URL=https://example.com/subscribe?token=…
   ```
3. Adjust `/data/adb/hoyofall/config.yaml` if you want different groups.
4. Point sing-box at the fragment via `/data/adb/hoyofall/android.conf`.

The module action (Magisk action button, or
`su -c 'sh /data/adb/modules/hoyofall/action.sh'`) restarts the daemon and prints
the log tail. `nu /data/adb/modules/hoyofall/action.nu --status` prints status
only.

## sing-box integration

`service.nu` starts a watcher that copies the atomic fragment into your sing-box
module's config directory and runs a reload hook whenever it changes. Configure
it in `/data/adb/hoyofall/android.conf` (TOML):

```toml
watch_singbox = true
singbox_dir = "/data/adb/box/conf"                 # your sing-box config dir
singbox_target = "hoyofall.json"
singbox_reload = ["/system/bin/pkill", "-HUP", "sing-box"]
watch_interval_seconds = 5
```

`singbox_dir = ""` disables injection; hoyofall still writes
`/data/adb/hoyofall/out/fragment.json` for you to wire up yourself. The watcher
is idempotent: it hashes the fragment and only acts on change.

## Shims

The Magisk/KernelSU module API executes `post-fs-data.sh`, `service.sh`,
`action.sh` and `uninstall.sh` with the system shell, so these four files are the
**only** shell scripts this repository permits. Each is a single `exec` of the
bundled Nushell with a hardcoded path and **no logic** (the prebuilt payload's
`lib/` is put on `LD_LIBRARY_PATH` via `/system/bin/env`, since the shim runs
`nu` before `service.nu` can set it):

```sh
#!/system/bin/sh
exec /system/bin/env LD_LIBRARY_PATH=/data/adb/modules/hoyofall/lib /data/adb/modules/hoyofall/bin/nu --no-config-file /data/adb/modules/hoyofall/service.nu
```

All behaviour lives in the matching `.nu` file. `scripts/check-shell.ts`
allowlists exactly these files; anything else is rejected by `pnpm lint`.

## Layout on device

| Path | Contents |
|---|---|
| `/data/adb/modules/hoyofall/` | Code: shims, `.nu`, `bin/node`, `bin/nu`, `index.js`, `lib/`. |
| `/data/adb/hoyofall/config.yaml` | Configuration (seeded on first boot). |
| `/data/adb/hoyofall/hoyofall.env` | Subscription tokens (`urlEnv`). |
| `/data/adb/hoyofall/android.conf` | sing-box hook settings (TOML). |
| `/data/adb/hoyofall/out/fragment.json` | Atomic aggregate fragment. |
| `/data/adb/hoyofall/log/hoyofall.log` | Daemon stdout/stderr. |

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

The **Nix-built module** (`nix build .#hoyofall-android`) pins prebuilt Termux
packages in `nix/android.nix` (`nodejsDeb`, `nushellDeb`, and the runtime
libraries, plus the CA bundle). To refresh: look up the current `Version`,
`Filename` and `SHA256` in the Termux `stable` aarch64 index
(`https://packages.termux.dev/apt/termux-main/dists/stable/main/binary-aarch64/Packages.gz`),
convert the hex SHA to SRI (`nix hash to-sri --type sha256 <hex>`), and update
the `deb` calls. If the package's `Depends` line changes, adjust the runtime
libraries in the `needed` list accordingly.

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
- **`nix build` fails downloading `platform-tools…zip` or the NDK with
  “Connection reset by peer”**: the host is resolving the Google host to an IPv6
  address your TUN/proxy does not carry, while IPv4 works (a browser falls back,
  Nix's `curl` does not). Force IPv4 for Nix's fetchers via the **Nix daemon's**
  environment — fetcher `impureEnvVars` come from the daemon, not your shell:

  ```nix
  # NixOS
  systemd.services.nix-daemon.environment.NIX_CURL_FLAGS = "-4";
  ```

  Then `sudo systemctl restart nix-daemon` (or `nixos-rebuild switch`). A proxy
  (`https_proxy`/`all_proxy` in the same daemon environment) also works. The
  Android inputs are fixed-output derivations, so once they fetch, the build
  phases run offline.
