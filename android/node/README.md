# android/node

Cross-compiles **Node.js** for Android (`aarch64-linux-android`, later
`x86_64-linux-android`) with the Android NDK. hoyofall's `dist/index.js` runs on
this binary; we do not reimplement the app.

## Pinned inputs

`versions.lock` pins the Node version, the source-tarball URL and its SHA-256,
the Android API level, and the provenance commit of the vendored patches. The
script refuses to build if the downloaded tarball's checksum does not match.

The NDK is *not* downloaded: pass `--ndk` or set `ANDROID_NDK_ROOT` /
`ANDROID_NDK_HOME`. Node 26 needs a modern clang (>= 19), so use **NDK r28 or
newer** (`ndk_revision_min`).

## Build

```bash
# from the repository root
nu android/node/build.nu --arch arm64 --ndk "$ANDROID_NDK_ROOT"
# -> android/dist/node-arm64/{node,lib/libc++_shared.so}
```

Options: `--arch arm64|x86_64`, `--intl none|small`, `--jobs N`,
`--out DIR`, `--force`.

## What it does

1. downloads and checksum-verifies `node-v<version>.tar.xz` into `android/.cache`;
2. extracts it under `android/build/node-<arch>`;
3. applies every `patches/termux/*.patch` (see [`patches/README.md`](./patches/README.md));
4. configures with `--dest-os=android --openssl-no-asm --cross-compiling
   --without-npm` and either `--without-intl` (default) or, with
   `--intl small`, `--with-intl=small-icu`, plus the NDK `clang`/`clang++`
   toolchain;
5. builds, strips with `llvm-strip`, and stages `node` (plus
   `libc++_shared.so` when the binary links it).

The module launcher sets `LD_LIBRARY_PATH` to the staged `lib/` directory.

## Why these patches

Node does not support Android upstream. The vendored patches are the Termux
`packages/nodejs` set, which is the maintained Android build of Node; pinning
them (rather than a floating download) keeps the build reproducible. See
[`patches/README.md`](./patches/README.md) for the exact commit.
