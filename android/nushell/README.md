# android/nushell

Cross-compiles **Nushell** for Android. hoyofall's Android module logic is
Nushell (bash is banned), so the module ships its own `nu`; there is nothing to
rely on in the Android base image.

This subproject starts **minimal** and is structured so it can be extracted into
an independent project later, then grown toward the full feature set.

## Pinned inputs

`versions.lock` pins the Nushell version, the source-tarball URL and its
SHA-256, the minimum Rust toolchain, the Android API level, and the provenance
commit of the vendored patch. The default feature set is **empty**:
`--no-default-features` drops `dap`, `lsp`, `mcp`, `plugin`, `sqlite`, `network`,
`rustls-tls`, `trash-support` and `system-clipboard`. That avoids
`openssl`/`rustls`/`aws-lc` in the cross build and keeps the binary small. The
module's `.nu` scripts use core Nushell plus external toybox/busybox applets and
do not need `http`.

The NDK is supplied via `--ndk` or `ANDROID_NDK_ROOT`/`ANDROID_NDK_HOME`.

## Build

```bash
# from the repository root
nu android/nushell/build.nu --arch arm64 --ndk "$ANDROID_NDK_ROOT"
# -> android/dist/nu-arm64/{nu,lib/libc++_shared.so}

# opt into networking later, if a script needs `http`:
nu android/nushell/build.nu --arch arm64 --features "network,rustls-tls"
```

Options: `--arch arm64|x86_64`, `--features LIST`, `--jobs N`, `--out DIR`,
`--force`.

## What it does

1. checks `cargo` and, with rustup, ensures the Rust Android target is installed;
2. downloads and checksum-verifies `nushell-<version>.tar.gz` into `android/.cache`;
3. extracts it under `android/build/nushell-<arch>`;
4. applies `patches/termux/*.patch` (see [`patches/README.md`](./patches/README.md));
5. sets `CC_/CXX_/AR_/CARGO_TARGET_*_LINKER` to the NDK toolchain and runs
   `cargo build --release --target <triple> --no-default-features`;
6. strips and stages `nu` (plus `libc++_shared.so` when the binary links it).

## Why this patch

`patches/termux/0001-remove-sysinfo-Users.patch` drops the `sysinfo` `Users`
call, which does not work on Android. It is vendored from Termux's
`packages/nushell` at the commit recorded in `versions.lock`.
